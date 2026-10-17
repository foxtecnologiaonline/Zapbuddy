import type { Job } from 'bullmq';
import { logProactiveInsight } from '@zapbuddy/db';
import { detectProactiveSignal, formatProactiveInsightMessage, summarizeSignalForLog, sendWhatsappTextMessage, type InsightsGenerateJob } from '@zapbuddy/core';

/**
 * Detecta (números reais, agregação SQL — nunca o LLM) e manda no máximo 1
 * insight proativo pro dono da conta. Nenhum sinal disparando = nenhuma
 * mensagem, de propósito (ADR 0003, decisão 1) — nunca manda só pra "ter
 * engajamento".
 */
export async function handleInsightsGenerate(job: Job<InsightsGenerateJob>): Promise<void> {
  const { accountId, ownerWhatsappNumber, ownerTimezone } = job.data;

  const signal = await detectProactiveSignal(accountId, ownerTimezone);
  if (!signal) return;

  await sendWhatsappTextMessage(ownerWhatsappNumber, formatProactiveInsightMessage(signal));
  await logProactiveInsight(accountId, signal.type, summarizeSignalForLog(signal));
}
