import { getMvpMetricsReport, type MvpMetricsReport } from '@zapbuddy/db';
import { CardRow, EmptyState, Section, StatCard, TableScroll, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

const COHORT_DAYS = 30;

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatMinutes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return 'menos de 1 min';
  if (value < 90) return `${Math.round(value)} min`;
  if (value < 48 * 60) return `${(value / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(value / 1440).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

const cell = { padding: '6px 8px' } as const;

export default async function MvpMetricsPage() {
  let report: MvpMetricsReport | null = null;
  let failure: string | null = null;
  try {
    report = await getMvpMetricsReport(COHORT_DAYS);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (report === null) {
    return (
      <Section title="Métricas do MVP">
        <EmptyState>Não consegui calcular agora: {failure}</EmptyState>
      </Section>
    );
  }

  const { retention, firstAction } = report.metrics;

  return (
    <>
      <Section title={`Retenção na semana 1 — cadastros dos últimos ${report.cohortDays} dias`}>
        {report.truncated ? (
          <p style={{ color: '#fbbf24', fontSize: 13 }}>
            Alguma consulta bateu no teto de linhas: os números abaixo são aproximados.
          </p>
        ) : null}

        {retention.matureCount === 0 ? (
          <EmptyState>
            Ninguém completou 7 dias de cadastro ainda
            {retention.inProgressCount > 0 ? ` (${retention.inProgressCount} ainda na semana 1)` : ''}. A retenção só é calculada para quem já teve a semana inteira.
          </EmptyState>
        ) : (
          <>
            <CardRow>
              <StatCard label="Coorte madura" value={retention.matureCount} hint={`${retention.inProgressCount} ainda na semana 1 (fora da conta)`} />
              <StatCard label="Dias ativos (média de 7)" value={formatNumber(retention.avgActiveDays)} hint="dias distintos com mensagem" />
              <StatCard label="Voltaram (≥ 2 dias ativos)" value={formatPercent(retention.pctReturned)} />
              <StatCard label="Ativos nos 7 dias" value={formatPercent(retention.pctEveryDay)} hint="leitura literal de “≥ 1 mensagem/dia”" />
            </CardRow>

            <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Ativos em cada dia após o cadastro</h3>
            <TableScroll>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                    <th style={cell}>Dia</th>
                    <th style={cell}>% da coorte</th>
                    <th style={{ ...cell, width: '60%' }} />
                  </tr>
                </thead>
                <tbody>
                  {retention.pctActiveByDay.map((value, day) => (
                    <tr key={day} style={{ borderTop: '1px solid #1c2430' }}>
                      <td style={cell}>{day === 0 ? 'Dia 0 (cadastro)' : `Dia ${day}`}</td>
                      <td style={cell}>{formatPercent(value)}</td>
                      <td style={cell}>
                        <div style={{ background: '#1c2430', borderRadius: 4, height: 8 }}>
                          <div style={{ width: `${value ?? 0}%`, background: '#4ade80', borderRadius: 4, height: 8 }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>

            <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Quantas pessoas tiveram N dias ativos</h3>
            <TableScroll>
              <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                    {retention.activeDaysHistogram.map((_, days) => (
                      <th key={days} style={cell}>
                        {days} {days === 1 ? 'dia' : 'dias'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {retention.activeDaysHistogram.map((count, days) => (
                      <td key={days} style={cell}>
                        {count}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </Section>

      <Section title="Tempo até a primeira ação">
        {firstAction.totalUsers === 0 ? (
          <EmptyState>Nenhum cadastro na janela.</EmptyState>
        ) : (
          <CardRow>
            <StatCard
              label="Chegaram a uma ação"
              value={formatPercent(firstAction.pctReached)}
              hint={`${firstAction.reachedCount} de ${firstAction.totalUsers} cadastros`}
            />
            <StatCard label="Mediana" value={formatMinutes(firstAction.medianMinutes)} hint="do cadastro à 1ª ação" />
            <StatCard label="90% chegam em até" value={formatMinutes(firstAction.p90Minutes)} />
            <StatCard label="Em até 10 min" value={formatPercent(firstAction.pctWithin10Min)} hint="só quem já tem 10 min de cadastro" />
            <StatCard label="Em até 24 h" value={formatPercent(firstAction.pctWithin24h)} hint="só quem já tem 24 h de cadastro" />
          </CardRow>
        )}
      </Section>

      <Section title="Como ler estes números">
        <ul style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>
            <strong>Dia N</strong> = N-ésima janela de 24h desde o cadastro (não dia do calendário), então não depende de fuso.
          </li>
          <li>
            <strong>Mensagem</strong> = texto, áudio ou documento aceito no webhook. Rejeitado, reação e status não contam.
          </li>
          <li>
            <strong>Coorte madura</strong> = quem já completou os 7 dias; quem ainda está na semana 1 fica de fora para não puxar a retenção para baixo.
          </li>
          <li>
            <strong>Ação</strong> = a pessoa passou a ter um registro criado (tarefa, lembrete, nota, gasto, evento, data importante, meta, conta recorrente ou hábito).
            Preferência, memória e onboarding não contam.
          </li>
          <li>Com poucos cadastros, o percentual oscila muito: 1 pessoa a mais ou a menos muda vários pontos. Leia junto com o tamanho da coorte.</li>
        </ul>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 12 }}>Calculado em {formatDateTime(report.generatedAt)}.</p>
      </Section>
    </>
  );
}
