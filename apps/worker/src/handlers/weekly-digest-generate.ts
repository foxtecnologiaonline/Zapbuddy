import type { Job } from 'bullmq';
import { summarizeTransactions, logWeeklyDigest, listTasks, listPersonalGoals, countNotesSince } from '@zapbuddy/db';
import {
  sendWhatsappTextMessage,
  formatWeeklyDigestMessage,
  getLast7DaysRange,
  getPreviousWeekRange,
  type WeeklyDigestGenerateJob,
} from '@zapbuddy/core';

/**
 * Manda o resumo dos últimos 7 dias pro dono da conta — sempre que chamado
 * (diferente de insights-generate, que só manda quando detecta anomalia).
 * Quem decide SE deve chamar (dia/hora + ainda não enviado essa semana) é o
 * insights-sweep.ts, que reaproveita a mesma varredura horária da Fase 3.
 *
 * Contadores não-financeiros (tarefa/meta/nota) somados ao resumo — posicio-
 * namento B2C ("lembra de tudo", não só financeiro) — reusam dado que já
 * existe, zero query nova além de contagens simples.
 */
export async function handleWeeklyDigestGenerate(job: Job<WeeklyDigestGenerateJob>): Promise<void> {
  const { accountId, ownerWhatsappNumber, ownerTimezone } = job.data;

  const range = getLast7DaysRange(ownerTimezone);
  const previousRange = getPreviousWeekRange(ownerTimezone);
  const [summary, previousSummary, pendingTasks, activeGoals, notesThisWeekCount] = await Promise.all([
    summarizeTransactions(accountId, range.startIso, range.endIso),
    summarizeTransactions(accountId, previousRange.startIso, previousRange.endIso),
    listTasks(accountId, 'pending'),
    listPersonalGoals(accountId, 'pending'),
    countNotesSince(accountId, range.startIso),
  ]);

  await sendWhatsappTextMessage(
    ownerWhatsappNumber,
    formatWeeklyDigestMessage(summary, {
      pendingTasksCount: pendingTasks.length,
      activeGoalsCount: activeGoals.length,
      notesThisWeekCount,
      previousSummary,
    }),
  );
  await logWeeklyDigest(accountId);
}
