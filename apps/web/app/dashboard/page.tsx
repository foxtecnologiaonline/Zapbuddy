import { redirect } from 'next/navigation';
import { buildReferralWhatsappDeepLink, WhatsappNumberNotConfiguredError } from '@zapbuddy/core';
import {
  findUserById,
  listTransactions,
  summarizeTransactions,
  listTasks,
  listRecentDocuments,
  getCalendarConnection,
  listAccountMembers,
  getReferralStats,
  listApiKeys,
  listWebhookSubscriptions,
  listMemoryFacts,
  listNotes,
  listImportantDates,
  listPersonalGoals,
  listActiveRecurringBills,
  listGoals,
} from '@zapbuddy/db';
import { getCurrentUserId, getCurrentAccount } from '@/lib/auth';
import { getCurrentMonthRange } from '@/lib/timezone';
import { CategoryBars, Sparkline } from './charts';
import { bucketSumsByDay, TREND_WINDOW_DAYS } from './trend';
import { buildTimeline, type TimelineEntry } from './timeline';

const MONTH_NAMES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const RECENT_TRANSACTIONS_LIMIT = 20;

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface DashboardPageProps {
  searchParams: Promise<{ calendar?: string; new_api_key?: string; new_webhook_secret?: string; webhook?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const user = await findUserById(userId);
  if (!user) redirect('/login');

  const account = await getCurrentAccount(userId);
  if (!account) redirect('/login');

  const { calendar: calendarStatus, new_api_key: newApiKey, new_webhook_secret: newWebhookSecret, webhook: webhookStatus } = await searchParams;
  const { startIso, endIso } = getCurrentMonthRange(user.timezone);
  const trendStartIso = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Consultas direcionadas (não uma só buscando 2000 linhas completas pra só
  // somar totais e exibir 20): o resumo só pede as colunas que soma, e a
  // tabela já vem limitada ao que de fato é exibido. Tudo escopado pela
  // conta (ADR 0002), não pelo usuário — pode incluir dado de outro membro.
  const [
    summary,
    recentTransactions,
    trendTransactions,
    pendingTasks,
    documents,
    calendarConnection,
    members,
    referralStats,
    apiKeys,
    webhookSubscriptions,
    memoryFacts,
    notes,
    importantDates,
    personalGoals,
    recurringBills,
    savingsGoals,
  ] = await Promise.all([
    summarizeTransactions(account.accountId, startIso, endIso),
    listTransactions(account.accountId, startIso, endIso, {
      limit: RECENT_TRANSACTIONS_LIMIT,
      columns: 'id, occurred_at, category, amount_cents, type',
    }),
    listTransactions(account.accountId, trendStartIso, new Date().toISOString(), {
      columns: 'occurred_at, amount_cents, type',
    }),
    listTasks(account.accountId, 'pending'),
    listRecentDocuments(account.accountId, 5),
    getCalendarConnection(account.accountId),
    listAccountMembers(account.accountId),
    getReferralStats(account.accountId),
    listApiKeys(account.accountId),
    listWebhookSubscriptions(account.accountId),
    listMemoryFacts(account.accountId),
    listNotes(account.accountId),
    listImportantDates(account.accountId),
    listPersonalGoals(account.accountId, 'pending'),
    listActiveRecurringBills(account.accountId),
    listGoals(account.accountId, 'active'),
  ]);

  let referralLink: string | null = null;
  try {
    referralLink = buildReferralWhatsappDeepLink(referralStats.code);
  } catch (error) {
    if (!(error instanceof WhatsappNumberNotConfiguredError)) throw error;
  }

  const dailyExpenseTrend = bucketSumsByDay(
    trendTransactions.filter((t) => t.type === 'expense'),
    user.timezone,
  );

  // Linha do tempo unificada (posicionamento B2C: "lembra de tudo", não só
  // financeiro) — mescla as últimas transações/tarefas/notas/fatos/metas já
  // buscadas acima, sem query nova (buildTimeline só mescla e ordena).
  const timelineEntries: TimelineEntry[] = [
    ...recentTransactions.map((t) => ({
      id: t.id,
      kind: 'transacao' as const,
      label: `${t.type === 'income' ? '+' : '-'}${formatCents(t.amount_cents)} em ${t.category}`,
      at: t.occurred_at,
    })),
    ...pendingTasks.map((task) => ({ id: task.id, kind: 'tarefa' as const, label: task.title, at: task.created_at })),
    ...notes.map((note) => ({ id: note.id, kind: 'nota' as const, label: note.content, at: note.created_at })),
    ...memoryFacts.map((fact) => ({ id: fact.id, kind: 'fato' as const, label: fact.fact, at: fact.created_at })),
    ...personalGoals.map((goal) => ({ id: goal.id, kind: 'meta' as const, label: goal.description, at: goal.created_at })),
  ];
  const timeline = buildTimeline(timelineEntries);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Olá, {user.name ?? 'usuário'}</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>
            Resumo do mês atual.
            {members.length > 1 && ` Conta compartilhada com ${members.length - 1} pessoa(s).`}
          </p>
          <p style={{ opacity: 0.6, margin: 0, fontSize: 13 }}>
            Horário de silêncio: {user.quiet_hours_start}h–{user.quiet_hours_end}h (sem resumo/insight proativo
            nessa janela — pra mudar, peça pro Tom no WhatsApp).
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
        <h2>Gasto por categoria</h2>
        {Object.keys(summary.byCategory).length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhum gasto este mês.</p>
        ) : (
          <CategoryBars byCategory={summary.byCategory} />
        )}
      </section>

      <section>
        <h2>Tendência ({TREND_WINDOW_DAYS} dias)</h2>
        {dailyExpenseTrend.every((v) => v === 0) ? (
          <p style={{ opacity: 0.6 }}>Nenhum gasto nos últimos {TREND_WINDOW_DAYS} dias.</p>
        ) : (
          <Sparkline data={dailyExpenseTrend} />
        )}
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
        <h2>Contas recorrentes</h2>
        {recurringBills.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma conta recorrente cadastrada ainda.</p>
        ) : (
          <ul>
            {recurringBills.map((bill) => (
              <li key={bill.id}>
                {bill.name} — {formatCents(bill.amount_cents)} (todo dia {bill.due_day})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Metas com valor</h2>
        {savingsGoals.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma meta com valor em andamento.</p>
        ) : (
          <ul>
            {savingsGoals.map((goal) => (
              <li key={goal.id}>
                {goal.title} — {formatCents(goal.saved_cents)} de {formatCents(goal.target_cents)}
                {goal.deadline && ` até ${new Date(goal.deadline).toLocaleDateString('pt-BR')}`}
              </li>
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

      <section>
        <h2>Notas</h2>
        {notes.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma nota ainda — manda "anota aí: ..." pro Tom no WhatsApp.</p>
        ) : (
          <ul style={{ fontSize: 14 }}>
            {notes.map((note) => (
              <li key={note.id}>{note.content}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Seus dados</h2>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Baixe tudo que você registrou com o Tom — gastos, tarefas, notas, contas, metas e o que ele lembra.
        </p>
        <a href="/api/dashboard/export">Baixar meus dados (JSON)</a>
      </section>

      <section>
        <h2>Metas pessoais</h2>
        {personalGoals.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma meta em andamento — manda "quero [algo]" pro Tom no WhatsApp.</p>
        ) : (
          <ul style={{ fontSize: 14 }}>
            {personalGoals.map((goal) => (
              <li key={goal.id}>
                {goal.description}
                <form action={`/api/dashboard/personal-goals/${goal.id}/complete`} method="POST" style={{ display: 'inline' }}>
                  <button type="submit" style={{ marginLeft: 8, fontSize: 12, cursor: 'pointer' }}>
                    concluir
                  </button>
                </form>
                <form action={`/api/dashboard/personal-goals/${goal.id}/delete`} method="POST" style={{ display: 'inline' }}>
                  <button type="submit" style={{ marginLeft: 4, fontSize: 12, cursor: 'pointer' }}>
                    remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Datas importantes</h2>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Aniversários e datas que se repetem todo ano — o Tom avisa sozinho no dia.
        </p>
        {importantDates.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma data guardada ainda.</p>
        ) : (
          <ul style={{ fontSize: 14 }}>
            {importantDates.map((date) => (
              <li key={date.id}>
                {date.label} — {date.day} de {MONTH_NAMES_PT[date.month - 1]}
                <form action={`/api/dashboard/important-dates/${date.id}/delete`} method="POST" style={{ display: 'inline' }}>
                  <button type="submit" style={{ marginLeft: 8, fontSize: 12, cursor: 'pointer' }}>
                    esquecer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>O que aconteceu essa semana</h2>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Transações, tarefas, notas, fatos e metas mais recentes, juntos numa só linha do tempo.
        </p>
        {timeline.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nada registrado ainda.</p>
        ) : (
          <ul style={{ fontSize: 14 }}>
            {timeline.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`}>
                <span style={{ opacity: 0.6, fontSize: 12 }}>[{entry.kind}]</span> {entry.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>O que o Tom lembra de você</h2>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Fatos que você contou em conversas e o Tom guardou pra usar depois — financeiro nunca entra
          aqui, só preferência/rotina pessoal.
        </p>
        {memoryFacts.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nada guardado ainda.</p>
        ) : (
          <ul style={{ fontSize: 14 }}>
            {memoryFacts.map((fact) => (
              <li key={fact.id}>
                {fact.fact}
                <form action={`/api/dashboard/memory-facts/${fact.id}/delete`} method="POST" style={{ display: 'inline' }}>
                  <button type="submit" style={{ marginLeft: 8, fontSize: 12, cursor: 'pointer' }}>
                    esquecer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Programa de indicação</h2>
        <p style={{ opacity: 0.7 }}>
          Seu código: <strong>{referralStats.code}</strong> — {referralStats.totalReferred} pessoa(s) já se cadastraram com ele.
        </p>
        {referralLink ? (
          <p style={{ opacity: 0.6, fontSize: 13 }}>
            Manda esse link pra pessoa que você quer indicar — ela só clica e já abre o WhatsApp com a mensagem certa pronta:{' '}
            <a href={referralLink} target="_blank" rel="noopener noreferrer">
              {referralLink}
            </a>
          </p>
        ) : (
          <p style={{ opacity: 0.6, fontSize: 13 }}>
            Pra indicar alguém, peça pra essa pessoa mandar &quot;indicado {referralStats.code}&quot; pro Tom como uma das primeiras mensagens dela.
          </p>
        )}
      </section>

      <section>
        <h2>API e webhooks</h2>
        <p style={{ opacity: 0.6, fontSize: 13 }}>Pra integrar seu financeiro/tarefas com outro sistema. Leitura apenas.</p>

        {newApiKey && (
          <p style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, wordBreak: 'break-all' }}>
            Sua chave de API (só aparece agora, guarde num lugar seguro): <code>{newApiKey}</code>
          </p>
        )}
        {newWebhookSecret && (
          <p style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, wordBreak: 'break-all' }}>
            Segredo de assinatura do webhook (só aparece agora): <code>{newWebhookSecret}</code>
          </p>
        )}
        {webhookStatus === 'error' && (
          <p style={{ color: 'var(--expense)', fontSize: 13 }}>URL inválida (precisa ser https://) ou nenhum evento selecionado.</p>
        )}

        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Chaves de API</h3>
        {apiKeys.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 13 }}>Nenhuma chave criada.</p>
        ) : (
          <ul style={{ fontSize: 13 }}>
            {apiKeys.map((key) => (
              <li key={key.id}>
                {key.name} — criada em {new Date(key.created_at).toLocaleDateString('pt-BR')}
                {key.revoked_at ? (
                  <span style={{ opacity: 0.5 }}> (revogada)</span>
                ) : (
                  <form action={`/api/dashboard/api-keys/${key.id}/revoke`} method="POST" style={{ display: 'inline' }}>
                    <button type="submit" style={{ marginLeft: 8, fontSize: 12, cursor: 'pointer' }}>
                      revogar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action="/api/dashboard/api-keys" method="POST" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input name="name" placeholder="Nome da chave (ex.: planilha)" style={{ flex: 1, padding: '6px 8px' }} />
          <button type="submit">Gerar chave</button>
        </form>

        <h3 style={{ fontSize: 15, marginTop: 16, marginBottom: 4 }}>Webhooks</h3>
        {webhookSubscriptions.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 13 }}>Nenhum webhook configurado.</p>
        ) : (
          <ul style={{ fontSize: 13 }}>
            {webhookSubscriptions.map((sub) => (
              <li key={sub.id}>
                {sub.url} ({sub.event_types.join(', ')})
                {sub.disabled_at ? (
                  <span style={{ opacity: 0.5 }}> (desabilitado)</span>
                ) : (
                  <form action={`/api/dashboard/webhooks/${sub.id}/disable`} method="POST" style={{ display: 'inline' }}>
                    <button type="submit" style={{ marginLeft: 8, fontSize: 12, cursor: 'pointer' }}>
                      desabilitar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action="/api/dashboard/webhooks" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <input name="url" placeholder="https://seu-sistema.com/webhook" style={{ padding: '6px 8px' }} />
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" name="event_types" value="transaction.created" /> transação criada
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" name="event_types" value="task.completed" /> tarefa concluída
          </label>
          <button type="submit" style={{ alignSelf: 'flex-start' }}>
            Adicionar webhook
          </button>
        </form>
      </section>
    </main>
  );
}
