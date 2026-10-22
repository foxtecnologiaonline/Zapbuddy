import type { Job } from 'bullmq';
import {
  listAccountsForInsightsSweep,
  hasSentProactiveInsightToday,
  hasSentWeeklyDigestSince,
  listImportantDatesForAccountOnDate,
  hasSentImportantDateReminderThisYear,
  logger,
} from '@zapbuddy/db';
import {
  getLocalHour,
  getLocalWeekday,
  getLocalDateParts,
  getTodayRange,
  getInsightsGenerateQueue,
  getWeeklyDigestGenerateQueue,
  getImportantDateReminderQueue,
  getMorningDigestGenerateQueue,
  isWithinQuietHours,
  type InsightsSweepJob,
} from '@zapbuddy/core';
import { handleProactiveResearch } from './proactive-research.js';
import { handleInterpretationFeedback } from './interpretation-feedback.js';
import { handleLogsRetention } from './logs-retention.js';
import { handleOnboardingNudge } from './onboarding-nudge.js';

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

// 9h local — manhã, horário distinto dos outros dois (18h/19h) pra não
// competir por conexão com o Supabase na mesma janela (mesmo raciocínio dos
// jobs semanais abaixo, em horas UTC distintas).
const IMPORTANT_DATE_LOCAL_HOUR = 9;

// Segunda 9h/10h/11h UTC (2026-10, antes eram 3 filas próprias com `repeat`
// do BullMQ — ver análise de consumo de Redis no CLAUDE.md): cada fila
// repetível fica presa 24/7 no teto de 10s de bloqueio do BullMQ (qualquer
// fila com job atrasado pendente cai nesse teto, `drainDelay` não ajuda
// nesse caso — ver worker.ts), um desperdício enorme pra um job que roda 1x
// por semana. Dobrados aqui dentro do sweep horário (que já roda 1x/hora de
// qualquer forma): cada checagem só passa na hora exata certa, reproduzindo
// o mesmo `repeat: '0 9/10/11 * * 1'` de antes sem fila dedicada. Horas
// distintas entre si de propósito, mesmo raciocínio dos horários locais
// acima — evita os três competindo por conexão com o Supabase junto.
const PROACTIVE_RESEARCH_UTC_WEEKDAY = 1; // segunda
const PROACTIVE_RESEARCH_UTC_HOUR = 9;
const INTERPRETATION_FEEDBACK_UTC_WEEKDAY = 1;
const INTERPRETATION_FEEDBACK_UTC_HOUR = 10;
const LOGS_RETENTION_UTC_WEEKDAY = 1;
const LOGS_RETENTION_UTC_HOUR = 11;

/**
 * Roda a manutenção semanal (pesquisa proativa / feedback de interpretação /
 * expurgo de logs) quando a checagem acerta a janela certa — nunca deixa uma
 * falha de manutenção derrubar o sweep horário de verdade (resumo/insight/
 * lembrete por conta), que roda logo depois desta função.
 */
async function runWeeklyMaintenance(): Promise<void> {
  const weekday = getLocalWeekday('UTC');
  const hour = getLocalHour('UTC');

  const jobs: { name: string; shouldRun: boolean; run: () => Promise<void> }[] = [
    {
      name: 'proactive_research',
      shouldRun: weekday === PROACTIVE_RESEARCH_UTC_WEEKDAY && hour === PROACTIVE_RESEARCH_UTC_HOUR,
      run: handleProactiveResearch,
    },
    {
      name: 'interpretation_feedback',
      shouldRun: weekday === INTERPRETATION_FEEDBACK_UTC_WEEKDAY && hour === INTERPRETATION_FEEDBACK_UTC_HOUR,
      run: handleInterpretationFeedback,
    },
    {
      name: 'logs_retention',
      shouldRun: weekday === LOGS_RETENTION_UTC_WEEKDAY && hour === LOGS_RETENTION_UTC_HOUR,
      run: handleLogsRetention,
    },
  ];

  for (const job of jobs) {
    if (!job.shouldRun) continue;
    try {
      await job.run();
    } catch (error) {
      logger.error('weekly_maintenance_job_failed', { job: job.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

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
  await runWeeklyMaintenance();

  // Reengajamento de onboarding (2026-10: sem fila própria — ver nota em
  // queues/definitions.ts) — checado em toda passada do sweep horário,
  // nunca derruba o resto se falhar.
  try {
    await handleOnboardingNudge();
  } catch (error) {
    logger.error('onboarding_nudge_sweep_failed', { error: error instanceof Error ? error.message : String(error) });
  }

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

      if (localHour === IMPORTANT_DATE_LOCAL_HOUR && !quiet) {
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
