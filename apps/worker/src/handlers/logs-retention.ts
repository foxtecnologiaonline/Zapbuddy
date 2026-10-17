import type { Job } from 'bullmq';
import { deleteToolCallLogsOlderThan, logger } from '@zapbuddy/db';

// 90 dias: bem acima da janela de qualquer consumidor real (admin mostra
// hoje/7 dias; interpretation-feedback agrega só os últimos 7 — ver
// PERIOD_MS em interpretation-feedback.ts), mas curto o bastante pra não
// deixar a tabela crescer pra sempre sem benefício.
const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Job semanal (ver scheduled-jobs.ts) — expurga tool_call_logs mais antigo
 * que RETENTION_DAYS. Só essa tabela: as outras (transactions, tasks,
 * reminders) são dado financeiro/produto do próprio usuário, retenção
 * indefinida de propósito; tool_call_logs é instrumentação de debug interna.
 */
export async function handleLogsRetention(_job: Job): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const deleted = await deleteToolCallLogsOlderThan(cutoff);
  logger.info('logs_retention_completed', { cutoff, deleted });
}
