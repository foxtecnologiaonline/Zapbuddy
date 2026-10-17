import type { Job } from 'bullmq';
import { listAccountsForInsightsSweep, hasSentProactiveInsightToday } from '@zapbuddy/db';
import { getLocalHour, getTodayRange, getInsightsGenerateQueue, type InsightsSweepJob } from '@zapbuddy/core';

// 19h local — fim de tarde/começo de noite, momento plausível de "ver como
// foi o dia" sem acordar ninguém (ADR 0003, decisão 2). Granularidade de
// hora (o sweep roda 1x/hora): o produto promete "no fim do dia", não um
// horário exato ao minuto.
const TARGET_LOCAL_HOUR = 19;

/**
 * Varre todas as contas 1x/hora (fila repetível, registrada em worker.ts) —
 * não gera o insight aqui, só decide QUEM deve receber um agora e enfileira
 * um job por conta (insights-generate) pra fazer o trabalho pesado
 * isolado/retentável por conta.
 */
export async function handleInsightsSweep(_job: Job<InsightsSweepJob>): Promise<void> {
  const accounts = await listAccountsForInsightsSweep();

  await Promise.all(
    accounts.map(async (account) => {
      if (getLocalHour(account.ownerTimezone) !== TARGET_LOCAL_HOUR) return;

      const today = getTodayRange(account.ownerTimezone);
      const alreadySent = await hasSentProactiveInsightToday(account.accountId, today.startIso, today.endIso);
      if (alreadySent) return;

      // jobId com a data embutida: segunda camada de idempotência (além do
      // check acima) — se o sweep rodar 2x na mesma janela por algum motivo,
      // BullMQ não duplica o job.
      await getInsightsGenerateQueue().add(
        'generate',
        { accountId: account.accountId, ownerWhatsappNumber: account.ownerWhatsappNumber, ownerTimezone: account.ownerTimezone },
        { jobId: `${account.accountId}:${today.startIso.slice(0, 10)}` },
      );
    }),
  );
}
