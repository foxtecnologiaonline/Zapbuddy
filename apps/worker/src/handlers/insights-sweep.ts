import type { Job } from 'bullmq';
import { listAccountsForInsightsSweep, hasSentProactiveInsightToday, hasSentWeeklyDigestSince } from '@zapbuddy/db';
import {
  getLocalHour,
  getLocalWeekday,
  getTodayRange,
  getInsightsGenerateQueue,
  getWeeklyDigestGenerateQueue,
  getMorningDigestGenerateQueue,
  isWithinQuietHours,
  type InsightsSweepJob,
} from '@zapbuddy/core';

// 19h local — fim de tarde/começo de noite, momento plausível de "ver como
// foi o dia" sem acordar ninguém (ADR 0003, decisão 2). Granularidade de
// hora (o sweep roda 1x/hora): o produto promete "no fim do dia", não um
// horário exato ao minuto.
const TARGET_LOCAL_HOUR = 19;

// Sexta 18h local — fim de semana de trabalho, antes do horário do insight
// de anomalia (19h) pra não mandar duas mensagens seguidas na mesma hora.
const DIGEST_LOCAL_WEEKDAY = 5; // sexta
const DIGEST_LOCAL_HOUR = 18;

// 8h local — primeira coisa do dia. Janela de silêncio padrão (22h–7h) não
// cobre esse horário, então por padrão sempre chega; quem configurar silêncio
// nessa faixa simplesmente não recebe o resumo matinal naquele dia.
const MORNING_DIGEST_LOCAL_HOUR = 8;

/**
 * Varre todas as contas 1x/hora (fila repetível, registrada em worker.ts) —
 * não gera o insight/resumo aqui, só decide QUEM deve receber o quê agora e
 * enfileira um job por conta (insights-generate / weekly-digest-generate)
 * pra fazer o trabalho isolado/retentável por conta. Resumo semanal reusa
 * esta mesma varredura (em vez de uma sweep paralela) por ser exatamente a
 * mesma decisão — "é a hora local certa pra essa conta?" — só com um
 * segundo gatilho de dia/hora.
 */
export async function handleInsightsSweep(_job: Job<InsightsSweepJob>): Promise<void> {
  const accounts = await listAccountsForInsightsSweep();

  await Promise.all(
    accounts.map(async (account) => {
      const localHour = getLocalHour(account.ownerTimezone);
      const quiet = isWithinQuietHours(localHour, account.quietHoursStart, account.quietHoursEnd);

      if (localHour === MORNING_DIGEST_LOCAL_HOUR && !quiet) {
        const today = getTodayRange(account.ownerTimezone);
        await getMorningDigestGenerateQueue().add(
          'generate',
          { accountId: account.accountId, ownerWhatsappNumber: account.ownerWhatsappNumber, ownerTimezone: account.ownerTimezone },
          { jobId: `morning:${account.accountId}:${today.startIso.slice(0, 10)}` },
        );
      }

      if (localHour === TARGET_LOCAL_HOUR && !quiet) {
        const today = getTodayRange(account.ownerTimezone);
        const alreadySent = await hasSentProactiveInsightToday(account.accountId, today.startIso, today.endIso);
        if (!alreadySent) {
          // jobId com a data embutida: segunda camada de idempotência (além
          // do check acima) — se o sweep rodar 2x na mesma janela por algum
          // motivo, BullMQ não duplica o job.
          await getInsightsGenerateQueue().add(
            'generate',
            { accountId: account.accountId, ownerWhatsappNumber: account.ownerWhatsappNumber, ownerTimezone: account.ownerTimezone },
            { jobId: `${account.accountId}:${today.startIso.slice(0, 10)}` },
          );
        }
      }

      if (localHour === DIGEST_LOCAL_HOUR && !quiet && getLocalWeekday(account.ownerTimezone) === DIGEST_LOCAL_WEEKDAY) {
        // "Essa semana" = últimos 8 dias — folga de 1 dia sobre o intervalo
        // de 7 dias que o próprio resumo mostra, só pra idempotência (nunca
        // usado pra calcular o conteúdo do resumo, só pra decidir se já
        // mandou).
        const sinceIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
        const alreadySent = await hasSentWeeklyDigestSince(account.accountId, sinceIso);
        if (!alreadySent) {
          const today = getTodayRange(account.ownerTimezone);
          await getWeeklyDigestGenerateQueue().add(
            'generate',
            { accountId: account.accountId, ownerWhatsappNumber: account.ownerWhatsappNumber, ownerTimezone: account.ownerTimezone },
            { jobId: `digest:${account.accountId}:${today.startIso.slice(0, 10)}` },
          );
        }
      }
    }),
  );
}
