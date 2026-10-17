import type { Job } from 'bullmq';
import { summarizeTransactions, logWeeklyDigest } from '@zapbuddy/db';
import { sendWhatsappTextMessage, formatWeeklyDigestMessage, getLast7DaysRange, type WeeklyDigestGenerateJob } from '@zapbuddy/core';

/**
 * Manda o resumo dos últimos 7 dias pro dono da conta — sempre que chamado
 * (diferente de insights-generate, que só manda quando detecta anomalia).
 * Quem decide SE deve chamar (dia/hora + ainda não enviado essa semana) é o
 * insights-sweep.ts, que reaproveita a mesma varredura horária da Fase 3.
 */
export async function handleWeeklyDigestGenerate(job: Job<WeeklyDigestGenerateJob>): Promise<void> {
  const { accountId, ownerWhatsappNumber, ownerTimezone } = job.data;

  const range = getLast7DaysRange(ownerTimezone);
  const summary = await summarizeTransactions(accountId, range.startIso, range.endIso);

  await sendWhatsappTextMessage(ownerWhatsappNumber, formatWeeklyDigestMessage(summary));
  await logWeeklyDigest(accountId);
}
