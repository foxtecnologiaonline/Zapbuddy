import { Suspense } from 'react';
import Link from 'next/link';
import { countAllRows } from '@zapbuddy/db';
import { getAllQueueCounts, pingRedis } from '@zapbuddy/core';
import { Badge, CardRow, Section, Sparkline, StatCard, TableScroll } from './components';
import { getCachedOverviewStats } from './overview-data';

export const dynamic = 'force-dynamic';

const VARIANT_LABELS: Record<string, string> = {
  ask_name_first: 'Nome primeiro (controle)',
  ask_action_first: 'Ação primeiro',
};

function SectionSkeleton({ label }: { label: string }) {
  return <p style={{ opacity: 0.4, fontSize: 13, padding: '8px 0 24px' }}>Carregando {label}…</p>;
}

/**
 * Tudo aqui é Postgres (cacheado 30s via getCachedOverviewStats) — nunca
 * depende do Redis, então nunca deveria ficar lento/travado por causa dele.
 * Separado do resto justamente pra garantir isso: ver QueueAndInfraSection.
 */
async function StatsSections() {
  const stats = await getCachedOverviewStats();

  return (
    <>
      <Section title="Visitas (webhook)">
        <CardRow>
          <StatCard label="Aceitas hoje" value={stats.webhookAcceptedToday} />
          <StatCard label="Aceitas (7 dias)" value={stats.webhookAccepted7d} />
          <StatCard label="Rejeitadas (7 dias)" value={stats.webhookRejected7d} hint="assinatura/secret inválidos" />
        </CardRow>
      </Section>

      <Section title="Chamadas (tool calls da IA)" action={<Link href="/admin/calls" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver log →</Link>}>
        <CardRow>
          <StatCard label="Hoje" value={stats.toolCallsToday} />
          <StatCard label="7 dias" value={stats.toolCalls7d} />
          <StatCard
            label="Falhas (7 dias)"
            value={stats.toolCallsFailed7d}
            hint={stats.toolCalls7d > 0 ? `${((stats.toolCallsFailed7d / stats.toolCalls7d) * 100).toFixed(1)}% do total` : undefined}
          />
          <div style={{ flex: '1 1 160px', background: '#121821', borderRadius: 8, padding: 16 }}>
            <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 8 }}>Últimos 14 dias</div>
            <Sparkline data={stats.toolCallsTrend} />
          </div>
        </CardRow>
      </Section>

      <Section title="Contatos" action={<Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver lista →</Link>}>
        <CardRow>
          <StatCard label="Total" value={stats.totalUsers} />
          <StatCard label="Novos hoje" value={stats.newUsersToday} />
          <StatCard label="Novos (7 dias)" value={stats.newUsers7d} />
          <div style={{ flex: '1 1 160px', background: '#121821', borderRadius: 8, padding: 16 }}>
            <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 8 }}>Novos/dia (14 dias)</div>
            <Sparkline data={stats.newContactsTrend} color="#60a5fa" />
          </div>
        </CardRow>
      </Section>

      <Section title="Funil de onboarding" action={<Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver contatos →</Link>}>
        <TableScroll>
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
              {stats.onboardingFunnel.map((row) => (
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
        </TableScroll>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
          Split determinístico por número de WhatsApp (ADR 0005) — leitura manual, sem teste de
          significância estatística automático.
        </p>
      </Section>

      <Section title="Assinaturas" action={<Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver contatos →</Link>}>
        <CardRow>
          <StatCard label="Trial" value={stats.planStatusCounts.trial} />
          <StatCard label="Ativas" value={stats.planStatusCounts.active} />
          <StatCard label="Canceladas" value={stats.planStatusCounts.canceled} />
          <StatCard
            label="Pedidos de assinatura"
            value={stats.pendingUpgradeIntents}
            hint="aguardando contato humano (register_plan_intent)"
          />
        </CardRow>
      </Section>

      <Section title="Erros" action={<Link href="/admin/errors" style={{ color: '#9fb0c0', fontSize: 13 }}>Ver detalhes →</Link>}>
        <CardRow>
          <StatCard label="Hoje" value={stats.errorsTotalToday} hint="error_logs + tool calls falhas" />
          <StatCard label="7 dias" value={stats.errorsTotal7d} hint="error_logs + tool calls falhas" />
          <StatCard
            label="Lembretes travados"
            value={<Link href="/admin/reminders?status=failed" style={{ color: '#f87171', textDecoration: 'none' }}>{stats.failedReminders}</Link>}
            hint="status = failed, sem janela de tempo"
          />
          <div style={{ flex: '1 1 160px', background: '#121821', borderRadius: 8, padding: 16 }}>
            <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 8 }}>Chamadas falhas/dia (14 dias)</div>
            <Sparkline data={stats.toolCallsFailedTrend} color="#f87171" />
          </div>
        </CardRow>
      </Section>
    </>
  );
}

/**
 * Isolado do resto justamente porque Redis/BullMQ é a única dependência que
 * pode ficar lenta ou cair sem o Postgres estar com nada — sem esse
 * isolamento, um Redis fora do ar travava a visão geral inteira (inclusive
 * as seções que não dependem dele). Sem cache: é literalmente a checagem de
 * "tá no ar agora", cachear mentiria sobre isso.
 */
async function QueueAndInfraSection() {
  const [queueCounts, redisOk, rowCounts] = await Promise.all([
    getAllQueueCounts().catch(() => []),
    pingRedis(),
    countAllRows(),
  ]);

  return (
    <>
      <Section title="Fila (BullMQ)">
        {queueCounts.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 13 }}>Não foi possível ler as filas (Redis inacessível?).</p>
        ) : (
          <TableScroll>
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
          </TableScroll>
        )}
      </Section>

      <Section title="Infraestrutura">
        <CardRow>
          <StatCard label="Redis" value={redisOk ? <Badge tone="ok">conectado</Badge> : <Badge tone="bad">inacessível</Badge>} />
          <StatCard label="Node" value={process.version} />
        </CardRow>
        <TableScroll>
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
        </TableScroll>
      </Section>
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <>
      <h1 style={{ marginBottom: 24 }}>Admin do Tom</h1>
      <Suspense fallback={<SectionSkeleton label="estatísticas" />}>
        <StatsSections />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="fila e infraestrutura" />}>
        <QueueAndInfraSection />
      </Suspense>
    </>
  );
}
