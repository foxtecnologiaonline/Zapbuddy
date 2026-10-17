import { redirect } from 'next/navigation';
import {
  findUserById,
  listTransactions,
  summarizeTransactions,
  listTasks,
  listRecentDocuments,
  getCalendarConnection,
  listAccountMembers,
} from '@zapbuddy/db';
import { getCurrentUserId, getCurrentAccount } from '@/lib/auth';
import { getCurrentMonthRange } from '@/lib/timezone';

const RECENT_TRANSACTIONS_LIMIT = 20;

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface DashboardPageProps {
  searchParams: Promise<{ calendar?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const user = await findUserById(userId);
  if (!user) redirect('/login');

  const account = await getCurrentAccount(userId);
  if (!account) redirect('/login');

  const { calendar: calendarStatus } = await searchParams;
  const { startIso, endIso } = getCurrentMonthRange(user.timezone);

  // Consultas direcionadas (não uma só buscando 2000 linhas completas pra só
  // somar totais e exibir 20): o resumo só pede as colunas que soma, e a
  // tabela já vem limitada ao que de fato é exibido. Tudo escopado pela
  // conta (ADR 0002), não pelo usuário — pode incluir dado de outro membro.
  const [summary, recentTransactions, pendingTasks, documents, calendarConnection, members] = await Promise.all([
    summarizeTransactions(account.accountId, startIso, endIso),
    listTransactions(account.accountId, startIso, endIso, {
      limit: RECENT_TRANSACTIONS_LIMIT,
      columns: 'id, occurred_at, category, amount_cents, type',
    }),
    listTasks(account.accountId, 'pending'),
    listRecentDocuments(account.accountId, 5),
    getCalendarConnection(account.accountId),
    listAccountMembers(account.accountId),
  ]);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Olá, {user.name ?? 'usuário'}</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>
            Painel somente leitura — mês atual.
            {members.length > 1 && ` Conta compartilhada com ${members.length - 1} pessoa(s).`}
          </p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Sair
          </button>
        </form>
      </div>

      {calendarStatus === 'connected' && (
        <p style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
          Google Agenda conectado com sucesso.
        </p>
      )}
      {calendarStatus === 'error' && (
        <p style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--expense)' }}>
          Não deu pra conectar o Google Agenda. Tenta de novo?
        </p>
      )}

      <section className="cards-row">
        <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: 16 }}>
          <div style={{ opacity: 0.6, fontSize: 13 }}>Receitas</div>
          <div style={{ fontSize: 24 }}>{formatCents(summary.totalIncomeCents)}</div>
        </div>
        <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: 16 }}>
          <div style={{ opacity: 0.6, fontSize: 13 }}>Gastos</div>
          <div style={{ fontSize: 24 }}>{formatCents(summary.totalExpenseCents)}</div>
        </div>
      </section>

      <section>
        <h2>Tarefas pendentes</h2>
        {pendingTasks.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma tarefa pendente.</p>
        ) : (
          <ul>
            {pendingTasks.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Últimas transações</h2>
        {recentTransactions.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma transação este mês.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--row-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 13, color: 'var(--muted-strong)' }}>
                  Data
                </th>
                <th style={{ textAlign: 'left', fontSize: 13, color: 'var(--muted-strong)' }}>Categoria</th>
                <th style={{ textAlign: 'right', fontSize: 13, color: 'var(--muted-strong)' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--row-border)' }}>
                  <td style={{ padding: '6px 0' }}>
                    {new Date(t.occurred_at).toLocaleDateString('pt-BR', { timeZone: user.timezone })}
                  </td>
                  <td>{t.category}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      color: t.type === 'income' ? 'var(--income)' : 'var(--expense)',
                    }}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {formatCents(t.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Google Agenda</h2>
        {calendarConnection ? (
          <p style={{ opacity: 0.7 }}>Conectado.</p>
        ) : (
          <a
            href="/api/calendar/connect"
            style={{
              display: 'inline-block',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 14px',
              color: 'var(--fg)',
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Conectar Google Agenda
          </a>
        )}
      </section>

      <section>
        <h2>Documentos recentes</h2>
        {documents.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhum documento enviado ainda.</p>
        ) : (
          <ul>
            {documents.map((doc) => (
              <li key={doc.id}>
                <a href={doc.download_url} target="_blank" rel="noreferrer">
                  {doc.file_name}
                </a>
                {doc.caption && <span style={{ opacity: 0.6 }}> — {doc.caption}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
