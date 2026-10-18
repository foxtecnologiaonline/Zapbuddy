import Link from 'next/link';
import {
  countAllRows,
  countErrorsSince,
  countFailedReminders,
  countPendingUpgradeIntents,
  countToolCallLogsSince,
  countUsers,
  countUsersByPlanStatus,
  countUsersSince,
  countWebhookEventsSince,
  getOnboardingFunnel,
} from '@zapbuddy/db';
import { getAllQueueCounts, pingRedis } from '@zapbuddy/core';
import { Badge, CardRow, Section, StatCard } from './components';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function AdminOverviewPage() {
  const now = Date.now();
  const sinceTodayIso = new Date(now - DAY_MS).toISOString();
  const since7dIso = new Date(now - 7 * DAY_MS).toISOString();

  const [
    totalUsers,
    newUsersToday,
    newUsers7d,
    onboardingFunnel,
    planStatusCounts,
    pendingUpgradeIntents,
    webhookAcceptedToday,
    webhookAccepted7d,
    webhookRejected7d,
    toolCallsToday,
    toolCalls7d,
    toolCallsFailedToday,
    toolCallsFailed7d,
    errorsToday,
    errors7d,
    failedReminders,
    queueCounts,
    redisOk,
    rowCounts,
  ] = await Promise.all([
    countUsers(),
    countUsersSince(sinceTodayIso),
    countUsersSince(since7dIso),
    getOnboardingFunnel(),
    countUsersByPlanStatus(),
    countPendingUpgradeIntents(),
    countWebhookEventsSince(sinceTodayIso, 'accepted'),
    countWebhookEventsSince(since7dIso, 'accepted'),
    countWebhookEventsSince(since7dIso, 'rejected'),
    countToolCallLogsSince(sinceTodayIso),
    countToolCallLogsSince(since7dIso),
    countToolCallLogsSince(sinceTodayIso, false),
    countToolCallLogsSince(since7dIso, false),
    countErrorsSince(sinceTodayIso),
    countErrorsSince(since7dIso),
    countFailedReminders(),
    getAllQueueCounts(),
    pingRedis(),
    countAllRows(),
  ]);

  const errorsTotalToday = errorsToday + toolCallsFailedToday;
  const errorsTotal7d = errors7d + toolCallsFailed7d;

  const VARIANT_LABELS: Record<string, string> = {
    ask_name_first: 'Nome primeiro (controle)',
    ask_action_first: 'Ação primeiro',
  };

  return (
    <>
      <h1 style={{ marginBottom: 24 }}>Admin do Tom</h1>

      <Section title="Visitas (webhook)">
        <CardRow>
          <StatCard label="Aceitas hoje" value={webhookAcceptedToday} />
          <StatCard label="Aceitas (7 dias)" value={webhookAccepted7d} />
          <StatCard label="Rejeitadas (7 dias)" value={webhookRejected7d} hint="assinatura/secret inválidos" />
        </CardRow>
      </Section>

      <Section title="Chamadas (tool calls da IA)" action={<Link href="/admin/calls" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver log →</Link>}>
        <CardRow>
          <StatCard label="Hoje" value={toolCallsToday} />
          <StatCard label="7 dias" value={toolCalls7d} />
          <StatCard
            label="Falhas (7 dias)"
            value={toolCallsFailed7d}
            hint={toolCalls7d > 0 ? `${((toolCallsFailed7d / toolCalls7d) * 100).toFixed(1)}% do total` : undefined}
          />
        </CardRow>
      </Section>

      <Section title="Contatos" action={<Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver lista →</Link>}>
        <CardRow>
          <StatCard label="Total" value={totalUsers} />
          <StatCard label="Novos hoje" value={newUsersToday} />
          <StatCard label="Novos (7 dias)" value={newUsers7d} />
        </CardRow>
      </Section>

      <Section title="Funil de onboarding" action={<Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver contatos →</Link>}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>Variante</th>
              <th style={{ padding: '4px 8px' }}>Cadastros</th>
              <th style={{ padding: '4px 8px' }}>Completos</th>
              <th style={{ padding: '4px 8px' }}>Taxa</th>
              <th style={{ padding: '4px 8px' }}>Tempo médio até completar</th>
              <th style={{ padding: '4px 8px' }}>Travados (&gt;24h)</th>
            </tr>
          </thead>
          <tbody>
            {onboardingFunnel.map((row) => (
              <tr key={row.variant} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px' }}>{VARIANT_LABELS[row.variant] ?? row.variant}</td>
                <td style={{ padding: '6px 8px' }}>{row.total}</td>
                <td style={{ padding: '6px 8px' }}>{row.completed}</td>
                <td style={{ padding: '6px 8px' }}>
                  {row.total > 0 ? `${((row.completed / row.total) * 100).toFixed(1)}%` : '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {row.avgCompletionMinutes !== null ? `${row.avgCompletionMinutes} min` : '—'}
                </td>
                <td style={{ padding: '6px 8px', color: row.stalledOver24h > 0 ? '#f87171' : undefined }}>
                  {row.stalledOver24h}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
          Split determinístico por número de WhatsApp (ADR 0005) — leitura manual, sem teste de
          significância estatística automático.
        </p>
      </Section>

      <Section title="Assinaturas" action={<Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver contatos →</Link>}>
        <CardRow>
          <StatCard label="Trial" value={planStatusCounts.trial} />
          <StatCard label="Ativas" value={planStatusCounts.active} />
          <StatCard label="Canceladas" value={planStatusCounts.canceled} />
          <StatCard
            label="Pedidos de assinatura"
            value={pendingUpgradeIntents}
            hint="aguardando contato humano (register_plan_intent)"
          />
        </CardRow>
      </Section>

      <Section title="Erros" action={<Link href="/admin/errors" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver detalhes →</Link>}>
        <CardRow>
          <StatCard label="Hoje" value={errorsTotalToday} hint="error_logs + tool calls falhas" />
          <StatCard label="7 dias" value={errorsTotal7d} hint="error_logs + tool calls falhas" />
          <StatCard label="Lembretes travados" value={failedReminders} hint="status = failed, sem janela de tempo" />
        </CardRow>
      </Section>

      <Section title="Fila (BullMQ)">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>Fila</th>
              <th style={{ padding: '4px 8px' }}>Esperando</th>
              <th style={{ padding: '4px 8px' }}>Ativa</th>
              <th style={{ padding: '4px 8px' }}>Atrasada</th>
              <th style={{ padding: '4px 8px' }}>Falhada</th>
              <th style={{ padding: '4px 8px' }}>Concluída</th>
            </tr>
          </thead>
          <tbody>
            {queueCounts.map((q) => (
              <tr key={q.name} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px' }}>{q.name}</td>
                <td style={{ padding: '6px 8px' }}>{q.waiting}</td>
                <td style={{ padding: '6px 8px' }}>{q.active}</td>
                <td style={{ padding: '6px 8px' }}>{q.delayed}</td>
                <td style={{ padding: '6px 8px', color: q.failed > 0 ? '#f87171' : undefined }}>{q.failed}</td>
                <td style={{ padding: '6px 8px', opacity: 0.6 }}>{q.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Infraestrutura">
        <CardRow>
          <StatCard label="Redis" value={redisOk ? <Badge tone="ok">conectado</Badge> : <Badge tone="bad">inacessível</Badge>} />
          <StatCard label="Node" value={process.version} />
        </CardRow>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
          <tbody>
            {Object.entries(rowCounts).map(([table, count]) => (
              <tr key={table} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px', opacity: 0.7 }}>{table}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{count.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
