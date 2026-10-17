import type { Job } from 'bullmq';
import { listToolCallLogsInRange, insertInterpretationInsight, type ToolCallLog } from '@zapbuddy/db';

const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

interface ToolStats {
  total: number;
  failed: number;
  topErrors: { error: string; count: number }[];
}

export interface InterpretationReport {
  summary: string;
  stats: Record<string, ToolStats>;
}

/**
 * Agregação pura (sem I/O) pra ser testável sem mock de banco — o handler
 * só busca os logs e chama isto. Deliberadamente sem chamada de LLM aqui:
 * contagem determinística é suficiente pro propósito ("insumo de debug pra
 * revisão humana", CLAUDE.md), e evita custo/latência extra num job que já
 * não é tempo-sensível.
 */
export function buildInterpretationReport(logs: ToolCallLog[]): InterpretationReport {
  const stats: Record<string, ToolStats> = {};

  for (const log of logs) {
    const entry = (stats[log.tool_name] ??= { total: 0, failed: 0, topErrors: [] });
    entry.total += 1;
    if (!log.success) {
      entry.failed += 1;
      const existing = entry.topErrors.find((item) => item.error === (log.error ?? 'erro desconhecido'));
      if (existing) {
        existing.count += 1;
      } else {
        entry.topErrors.push({ error: log.error ?? 'erro desconhecido', count: 1 });
      }
    }
  }

  const lines = Object.entries(stats)
    .filter(([, entry]) => entry.failed > 0)
    .sort(([, a], [, b]) => b.failed - a.failed)
    .map(([toolName, entry]) => {
      entry.topErrors.sort((a, b) => b.count - a.count);
      const topError = entry.topErrors[0];
      const errorNote = topError ? ` (erro mais comum: "${topError.error}", ${topError.count}x)` : '';
      return `${toolName}: ${entry.failed}/${entry.total} chamadas falharam${errorNote}`;
    });

  const summary = lines.length > 0 ? lines.join('\n') : 'Nenhuma falha de tool call no período.';
  return { summary, stats };
}

/**
 * Job semanal (ver scheduled-jobs.ts) — mina tool_call_logs dos últimos 7
 * dias em busca de padrão de erro de interpretação de linguagem natural e
 * grava um relatório em interpretation_insights. Só leitura/relatório: não
 * ajusta prompt, categoria ou qualquer comportamento sozinho (CLAUDE.md).
 */
export async function handleInterpretationFeedback(_job: Job): Promise<void> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PERIOD_MS);

  const logs = await listToolCallLogsInRange(periodStart.toISOString(), periodEnd.toISOString());
  const report = buildInterpretationReport(logs);

  await insertInterpretationInsight({
    periodStartIso: periodStart.toISOString(),
    periodEndIso: periodEnd.toISOString(),
    summary: report.summary,
    stats: report.stats,
  });
}
