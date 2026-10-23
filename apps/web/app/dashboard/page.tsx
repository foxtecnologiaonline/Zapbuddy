import { redirect } from 'next/navigation';
import { buildReferralWhatsappDeepLink, WhatsappNumberNotConfiguredError, computeHabitStats, localDateKey } from '@zapbuddy/core';
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
  listActiveHabits,
  listHabitCheckinDates,
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
    habits,
    habitCheckinDates,
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
    listActiveHabits(account.accountId),
    listHabitCheckinDates(account.accountId, localDateKey(user.timezone)),
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
  const trendTotalCents = dailyExpenseTrend.reduce((sum, cents) => sum + cents, 0);

  // Saldo do mês é só a diferença entre o que já está registrado (receita −
  // gasto), sem estimativa nem projeção.
  const balanceCents = summary.totalIncomeCents - summary.totalExpenseCents;

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
    <main className="page">
      <header className="page-header">
        <div className="greeting">
          <h1>Olá, {user.name ?? 'usuário'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Resumo do mês atual.
            {members.length > 1 && ` Conta compartilhada com ${members.length - 1} pessoa(s).`}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Horário de silêncio: {user.quiet_hours_start}h–{user.quiet_hours_end}h (sem resumo/insight proativo
            nessa janela — pra mudar, peça pro Tom no WhatsApp).
          </p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="btn btn-sm">
            Sair
          </button>
        </form>
      </header>

      {calendarStatus === 'connected' && <p className="notice">Agenda conectada com sucesso.</p>}
      {calendarStatus === 'error' && <p className="notice notice-error">Não deu pra conectar a agenda. Tenta de novo?</p>}

      <section className="kpis" aria-label="Resumo do mês">
        <div className="kpi">
          <div className="kpi-label">Receitas</div>
          <div className="kpi-value kpi-value-income">{formatCents(summary.totalIncomeCents)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Gastos</div>
          <div className="kpi-value kpi-value-expense">{formatCents(summary.totalExpenseCents)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Saldo do mês</div>
          <div className={`kpi-value ${balanceCents >= 0 ? 'kpi-value-income' : 'kpi-value-expense'}`}>
            {formatCents(balanceCents)}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Tarefas pendentes</div>
          <div className="kpi-value">{pendingTasks.length}</div>
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Gasto por categoria</h2>
          <p className="muted-sm">Este mês, do maior pro menor.</p>
          {Object.keys(summary.byCategory).length === 0 ? (
            <p className="muted">Nenhum gasto este mês.</p>
          ) : (
            <CategoryBars byCategory={summary.byCategory} />
          )}
        </section>

        <section className="card">
          <h2>Tendência ({TREND_WINDOW_DAYS} dias)</h2>
          {dailyExpenseTrend.every((v) => v === 0) ? (
            <p className="muted">Nenhum gasto nos últimos {TREND_WINDOW_DAYS} dias.</p>
          ) : (
            <>
              <p className="muted-sm">Gastos por dia.</p>
              <div className="chart-total">{formatCents(trendTotalCents)}</div>
              <Sparkline data={dailyExpenseTrend} />
            </>
          )}
        </section>

        <section className="card span-2">
          <h2>Últimas transações</h2>
          <p className="muted-sm">As {RECENT_TRANSACTIONS_LIMIT} mais recentes deste mês.</p>
          {recentTransactions.length === 0 ? (
            <p className="muted">Nenhuma transação este mês.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t) => (
                    <tr key={t.id}>
                      <td className="col-date">
                        {new Date(t.occurred_at).toLocaleDateString('pt-BR', { timeZone: user.timezone })}
                      </td>
                      <td>{t.category}</td>
                      <td className="num" style={{ color: t.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                        {t.type === 'income' ? '+' : '-'}
                        {formatCents(t.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Tarefas pendentes</h2>
          {pendingTasks.length === 0 ? (
            <p className="muted">Nenhuma tarefa pendente.</p>
          ) : (
            <ul className="item-list">
              {pendingTasks.map((task) => (
                <li key={task.id}>{task.title}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Contas recorrentes</h2>
          {recurringBills.length === 0 ? (
            <p className="muted">Nenhuma conta recorrente cadastrada ainda.</p>
          ) : (
            <ul className="item-list">
              {recurringBills.map((bill) => (
                <li key={bill.id}>
                  <span>{bill.name}</span>
                  <span className="muted">
                    {formatCents(bill.amount_cents)} · todo dia {bill.due_day}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Metas com valor</h2>
          {savingsGoals.length === 0 ? (
            <p className="muted">Nenhuma meta com valor em andamento.</p>
          ) : (
            <ul className="item-list">
              {savingsGoals.map((goal) => (
                <li key={goal.id}>
                  <span>{goal.title}</span>
                  <span className="muted">
                    {formatCents(goal.saved_cents)} de {formatCents(goal.target_cents)}
                    {goal.deadline && ` · até ${new Date(goal.deadline).toLocaleDateString('pt-BR')}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Metas pessoais</h2>
          {personalGoals.length === 0 ? (
            <p className="muted">Nenhuma meta em andamento — manda &quot;quero [algo]&quot; pro Tom no WhatsApp.</p>
          ) : (
            <ul className="item-list">
              {personalGoals.map((goal) => (
                <li key={goal.id}>
                  <span>{goal.description}</span>
                  <span className="item-actions">
                    <form action={`/api/dashboard/personal-goals/${goal.id}/complete`} method="POST">
                      <button type="submit" className="btn btn-sm">
                        concluir
                      </button>
                    </form>
                    <form action={`/api/dashboard/personal-goals/${goal.id}/delete`} method="POST">
                      <button type="submit" className="btn btn-sm btn-danger">
                        remover
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Hábitos</h2>
          <p className="muted-sm">Conta pro Tom quando fizer — ex.: &quot;fui pra academia hoje&quot; — e ele acompanha a sequência.</p>
          {habits.length === 0 ? (
            <p className="muted">Nenhum hábito ainda — manda &quot;quero criar o hábito de [algo]&quot; pro Tom no WhatsApp.</p>
          ) : (
            <ul className="item-list">
              {habits.map((habit) => {
                const stats = computeHabitStats(habitCheckinDates[habit.id] ?? [], localDateKey(user.timezone));
                return (
                  <li key={habit.id}>
                    <span>
                      {habit.name}
                      {stats.doneToday && ' ✓'}
                    </span>
                    <span className="muted">
                      {stats.currentStreak} dia(s) seguido(s) · {stats.last7Days}/7 na semana
                    </span>
                    <span className="item-actions">
                      <form action={`/api/dashboard/habits/${habit.id}/archive`} method="POST">
                        <button type="submit" className="btn btn-sm btn-danger">
                          arquivar
                        </button>
                      </form>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Datas importantes</h2>
          <p className="muted-sm">Aniversários e datas que se repetem todo ano — o Tom avisa sozinho no dia.</p>
          {importantDates.length === 0 ? (
            <p className="muted">Nenhuma data guardada ainda.</p>
          ) : (
            <ul className="item-list">
              {importantDates.map((date) => (
                <li key={date.id}>
                  <span>
                    {date.label} <span className="muted">· {date.day} de {MONTH_NAMES_PT[date.month - 1]}</span>
                  </span>
                  <span className="item-actions">
                    <form action={`/api/dashboard/important-dates/${date.id}/delete`} method="POST">
                      <button type="submit" className="btn btn-sm btn-danger">
                        esquecer
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card span-2">
          <h2>O que aconteceu essa semana</h2>
          <p className="muted-sm">Transações, tarefas, notas, fatos e metas mais recentes, juntos numa só linha do tempo.</p>
          {timeline.length === 0 ? (
            <p className="muted">Nada registrado ainda.</p>
          ) : (
            <ul className="item-list timeline">
              {timeline.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <span className="tag">{entry.kind}</span>
                  <span className="timeline-text">{entry.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>O que o Tom lembra de você</h2>
          <p className="muted-sm">
            Fatos que você contou em conversas e o Tom guardou pra usar depois — financeiro nunca entra aqui, só
            preferência/rotina pessoal.
          </p>
          {memoryFacts.length === 0 ? (
            <p className="muted">Nada guardado ainda.</p>
          ) : (
            <ul className="item-list">
              {memoryFacts.map((fact) => (
                <li key={fact.id}>
                  <span>{fact.fact}</span>
                  <span className="item-actions">
                    <form action={`/api/dashboard/memory-facts/${fact.id}/delete`} method="POST">
                      <button type="submit" className="btn btn-sm btn-danger">
                        esquecer
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Notas</h2>
          {notes.length === 0 ? (
            <p className="muted">Nenhuma nota ainda — manda &quot;anota aí: ...&quot; pro Tom no WhatsApp.</p>
          ) : (
            <ul className="item-list">
              {notes.map((note) => (
                <li key={note.id}>{note.content}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Documentos recentes</h2>
          {documents.length === 0 ? (
            <p className="muted">Nenhum documento enviado ainda.</p>
          ) : (
            <ul className="item-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <span>
                    <a href={doc.download_url} target="_blank" rel="noreferrer">
                      {doc.file_name}
                    </a>
                    {doc.caption && <span className="muted"> — {doc.caption}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Agenda</h2>
          {calendarConnection ? (
            <>
              <p className="muted">Conectado: {calendarConnection.provider === 'microsoft' ? 'Outlook' : 'Google Agenda'}.</p>
              <p style={{ opacity: 0.6, fontSize: 13 }}>
                Conectar {calendarConnection.provider === 'microsoft' ? 'o Google Agenda' : 'o Outlook'} substitui esta conexão — só dá
                pra ter uma agenda conectada por vez.
              </p>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/api/calendar/connect" className="btn">
                Conectar Google Agenda
              </a>
              <a href="/api/calendar/microsoft/connect" className="btn">
                Conectar Outlook
              </a>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Programa de indicação</h2>
          <p>
            Seu código: <strong>{referralStats.code}</strong> — {referralStats.totalReferred} pessoa(s) já se cadastraram com ele.
          </p>
          {referralLink ? (
            <p className="muted-sm">
              Manda esse link pra pessoa que você quer indicar — ela só clica e já abre o WhatsApp com a mensagem certa pronta:{' '}
              <a href={referralLink} target="_blank" rel="noopener noreferrer">
                {referralLink}
              </a>
            </p>
          ) : (
            <p className="muted-sm">
              Pra indicar alguém, peça pra essa pessoa mandar &quot;indicado {referralStats.code}&quot; pro Tom como uma das primeiras mensagens dela.
            </p>
          )}
        </section>

        <section className="card">
          <h2>Seus dados</h2>
          <p className="muted-sm">Baixe tudo que você registrou com o Tom — gastos, tarefas, notas, contas, metas e o que ele lembra.</p>
          <a href="/api/dashboard/export" className="btn">
            Baixar meus dados (JSON)
          </a>
        </section>

        <section className="card span-2">
          <h2>API e webhooks</h2>
          <p className="muted-sm">Pra integrar seu financeiro/tarefas com outro sistema. Leitura apenas.</p>

          {newApiKey && (
            <p className="notice" style={{ wordBreak: 'break-all' }}>
              Sua chave de API (só aparece agora, guarde num lugar seguro): <code>{newApiKey}</code>
            </p>
          )}
          {newWebhookSecret && (
            <p className="notice" style={{ wordBreak: 'break-all' }}>
              Segredo de assinatura do webhook (só aparece agora): <code>{newWebhookSecret}</code>
            </p>
          )}
          {webhookStatus === 'error' && (
            <p className="notice notice-error">URL inválida (precisa ser https://) ou nenhum evento selecionado.</p>
          )}

          <h3>Chaves de API</h3>
          {apiKeys.length === 0 ? (
            <p className="muted-sm">Nenhuma chave criada.</p>
          ) : (
            <ul className="item-list item-list-sm">
              {apiKeys.map((key) => (
                <li key={key.id}>
                  <span>
                    {key.name} <span className="muted">· criada em {new Date(key.created_at).toLocaleDateString('pt-BR')}</span>
                  </span>
                  {key.revoked_at ? (
                    <span className="muted">revogada</span>
                  ) : (
                    <span className="item-actions">
                      <form action={`/api/dashboard/api-keys/${key.id}/revoke`} method="POST">
                        <button type="submit" className="btn btn-sm btn-danger">
                          revogar
                        </button>
                      </form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action="/api/dashboard/api-keys" method="POST" className="form-row">
            <input name="name" placeholder="Nome da chave (ex.: planilha)" className="field" />
            <button type="submit" className="btn btn-primary">
              Gerar chave
            </button>
          </form>

          <h3>Webhooks</h3>
          {webhookSubscriptions.length === 0 ? (
            <p className="muted-sm">Nenhum webhook configurado.</p>
          ) : (
            <ul className="item-list item-list-sm">
              {webhookSubscriptions.map((sub) => (
                <li key={sub.id}>
                  <span style={{ overflowWrap: 'anywhere' }}>
                    {sub.url} <span className="muted">({sub.event_types.join(', ')})</span>
                  </span>
                  {sub.disabled_at ? (
                    <span className="muted">desabilitado</span>
                  ) : (
                    <span className="item-actions">
                      <form action={`/api/dashboard/webhooks/${sub.id}/disable`} method="POST">
                        <button type="submit" className="btn btn-sm btn-danger">
                          desabilitar
                        </button>
                      </form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action="/api/dashboard/webhooks" method="POST" className="form-stack">
            <input name="url" placeholder="https://seu-sistema.com/webhook" className="field" />
            <label className="check">
              <input type="checkbox" name="event_types" value="transaction.created" /> transação criada
            </label>
            <label className="check">
              <input type="checkbox" name="event_types" value="task.completed" /> tarefa concluída
            </label>
            <div>
              <button type="submit" className="btn btn-primary">
                Adicionar webhook
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
