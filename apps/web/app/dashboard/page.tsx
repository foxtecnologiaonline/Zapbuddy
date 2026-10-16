import { redirect } from 'next/navigation';
import { findUserById, listTransactions, summarizeTransactions, listTasks } from '@zapbuddy/db';
import { getCurrentUserId } from '@/lib/auth';
import { getCurrentMonthRange } from '@/lib/timezone';

const RECENT_TRANSACTIONS_LIMIT = 20;

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const user = await findUserById(userId);
  if (!user) redirect('/login');

  const { startIso, endIso } = getCurrentMonthRange(user.timezone);

  // Duas consultas direcionadas em vez de uma só buscando até 2000 linhas
  // completas pra só somar totais e exibir 20: o resumo só pede as colunas
  // que soma, e a tabela já vem limitada ao que de fato é exibido.
  const [summary, recentTransactions, pendingTasks] = await Promise.all([
    summarizeTransactions(userId, startIso, endIso),
    listTransactions(userId, startIso, endIso, {
      limit: RECENT_TRANSACTIONS_LIMIT,
      columns: 'id, occurred_at, category, amount_cents, type',
    }),
    listTasks(userId, 'pending'),
  ]);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Olá, {user.name ?? 'usuário'}</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>Painel somente leitura — mês atual.</p>
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
    </main>
  );
}
