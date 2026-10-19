import type { Job } from 'bullmq';
import {
  listAccountsForInsightsSweep,
  hasSentProactiveInsightToday,
  hasSentWeeklyDigestSince,
  listImportantDatesForAccountOnDate,
  hasSentImportantDateReminderThisYear,
} from '@zapbuddy/db';
import {
  getLocalHour,
  getLocalWeekday,
  getLocalDateParts,
  getTodayRange,
  getInsightsGenerateQueue,
  getWeeklyDigestGenerateQueue,
  getImportantDateReminderQueue,
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

// 9h local — manhã, horário distinto dos outros dois (18h/19h) pra não
// competir por conexão com o Supabase na mesma janela (mesmo raciocínio do
// comentário em scheduled-jobs.ts sobre os jobs semanais em horas distintas).
const IMPORTANT_DATE_LOCAL_HOUR = 9;

/**
 * Varre todas as contas 1x/hora (fila repetível, registrada em worker.ts) —
 * não gera o insight/resumo/lembrete aqui, só decide QUEM deve receber o quê
 * agora e enfileira um job por conta (insights-generate / weekly-digest-
 * generate / important-date-reminder) pra fazer o trabalho isolado/
 * retentável. Resumo semanal e lembrete de data importante reusam esta
 * mesma varredura (em vez de uma sweep paralela cada) por ser exatamente a
 * mesma decisão — "é a hora local certa pra essa conta?" — só com
 * gatilhos de dia/hora e fonte de dado diferentes.
 */
export async function handleInsightsSweep(_job: Job<InsightsSweepJob>): Promise<void> {
  const accounts = await listAccountsForInsightsSweep();

  await Promise.all(
    accounts.map(async (account) => {
      const localHour = getLocalHour(account.ownerTimezone);

      if (localHour === TARGET_LOCAL_HOUR) {
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

      if (localHour === IMPORTANT_DATE_LOCAL_HOUR) {
        const { month, day, year } = getLocalDateParts(account.ownerTimezone);
        const matches = await listImportantDatesForAccountOnDate(account.accountId, month, day);

        await Promise.all(
          matches.map(async (importantDate) => {
            const alreadySent = await hasSentImportantDateReminderThisYear(importantDate.id, year);
            if (alreadySent) return;

            await getImportantDateReminderQueue().add(
              'send',
              { importantDateId: importantDate.id, label: importantDate.label, ownerWhatsappNumber: account.ownerWhatsappNumber, year },
              { jobId: `important-date:${importantDate.id}:${year}` },
            );
          }),
        );
      }

      if (localHour === DIGEST_LOCAL_HOUR && getLocalWeekday(account.ownerTimezone) === DIGEST_LOCAL_WEEKDAY) {
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
