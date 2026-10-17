import { Worker, type Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES, sendWhatsappTextMessage, MESSAGES } from '@zapbuddy/core';
import { logError, markReminderFailed, logger } from '@zapbuddy/db';
import { handleIncomingMessage } from './handlers/incoming-message.js';
import { handleAudioTranscription } from './handlers/audio-transcription.js';
import { handleReminderDispatch } from './handlers/reminder-dispatch.js';
import { handleProactiveResearch } from './handlers/proactive-research.js';
import { handleInterpretationFeedback } from './handlers/interpretation-feedback.js';
import { scheduleRecurringJobs } from './scheduled-jobs.js';

const connection = getRedisConnection();

function isExhausted(job: Job): boolean {
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

/**
 * Avisa o usuário SÓ quando o job esgotou todas as tentativas (ver
 * DEFAULT_JOB_OPTIONS em queues/definitions.ts) — nunca a cada retry
 * intermediário, senão a pessoa recebe "não consegui processar" várias
 * vezes seguidas enquanto o BullMQ ainda está tentando de novo por trás.
 */
async function notifyUserOfExhaustedJob(whatsappNumber: string): Promise<void> {
  try {
    await sendWhatsappTextMessage(whatsappNumber, MESSAGES.genericProcessingError);
  } catch (notifyError) {
    logger.error('exhausted_job_notify_failed', { whatsappNumber, notifyError });
  }
}

/**
 * Uma fila por tipo de job, de propósito (não unificadas num Worker só):
 * concorrência e comportamento de falha esgotada são diferentes por fila —
 * áudio é CPU/IO-bound e mais lento (concurrency menor), e só
 * reminder-dispatch não notifica o usuário no esgotamento (ver comentário
 * abaixo). O que esta tabela unifica é a construção/registro repetidos,
 * não as filas em si.
 */
const QUEUE_CONFIGS: {
  name: string;
  handler: (job: Job) => Promise<void>;
  concurrency: number;
  onExhausted?: (job: Job, error: Error) => Promise<void>;
}[] = [
  {
    name: QUEUE_NAMES.incomingMessage,
    handler: handleIncomingMessage,
    concurrency: 5,
    onExhausted: (job) => notifyUserOfExhaustedJob(job.data.whatsappNumber),
  },
  {
    name: QUEUE_NAMES.audioTranscription,
    handler: handleAudioTranscription,
    concurrency: 3,
    onExhausted: (job) => notifyUserOfExhaustedJob(job.data.whatsappNumber),
  },
  {
    name: QUEUE_NAMES.reminderDispatch,
    handler: handleReminderDispatch,
    concurrency: 5,
    // Sem notificação de fallback ao usuário aqui: se o próprio envio ao
    // WhatsApp é o que está falhando (ex.: fora da janela de 24h da Cloud
    // API, que exige template aprovado pra mensagem livre nesse caso —
    // limitação da Meta, não corrigível em código), mandar "deu erro" teria
    // o mesmo problema. Só marca 'failed' no banco quando esgota as
    // tentativas, pra não ficar preso em 'pending' pra sempre e indistinguível
    // de um lembrete que ainda vai disparar.
    onExhausted: async (job, error) => {
      const reminderId = job.data.reminderId as string;
      await markReminderFailed(reminderId, error.message).catch((dbError) => {
        logger.error('mark_reminder_failed_error', { reminderId, dbError });
      });
    },
  },
  {
    name: QUEUE_NAMES.proactiveResearch,
    handler: handleProactiveResearch,
    concurrency: 1,
  },
  {
    name: QUEUE_NAMES.interpretationFeedback,
    handler: handleInterpretationFeedback,
    concurrency: 1,
  },
];

const workers = QUEUE_CONFIGS.map(({ name, handler, concurrency, onExhausted }) => {
  const worker = new Worker(name, handler, { connection, concurrency });
  worker.on('failed', (job, error) => {
    logger.error('job_failed', { queue: name, jobId: job?.id, error: error.message, attemptsMade: job?.attemptsMade });
    if (!job || !isExhausted(job)) return;

    // Só loga no admin quando esgota as tentativas — um retry intermediário
    // ainda pode se recuperar sozinho (ver DEFAULT_JOB_OPTIONS), e logar cada
    // tentativa intermediária inflaria o card "Erros" com ruído transitório.
    void logError({
      source: 'worker',
      message: error.message,
      detail: { queue: name, jobId: job.id, data: job.data },
      userId: (job.data as { userId?: string }).userId ?? null,
    });
    if (onExhausted) void onExhausted(job, error);
  });
  return worker;
});

logger.info('worker_started', { queues: workers.map((w) => w.name) });

void scheduleRecurringJobs().catch((error) => {
  logger.error('schedule_recurring_jobs_failed', { error: error instanceof Error ? error.message : String(error) });
});

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
