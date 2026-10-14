import { Worker, type Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES, sendWhatsappTextMessage } from '@zapbuddy/core';
import { markReminderFailed } from '@zapbuddy/db';
import { handleIncomingMessage } from './handlers/incoming-message.js';
import { handleAudioTranscription } from './handlers/audio-transcription.js';
import { handleReminderDispatch } from './handlers/reminder-dispatch.js';

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
    await sendWhatsappTextMessage(
      whatsappNumber,
      'Desculpa, tive um problema técnico pra processar sua última mensagem. Pode mandar de novo?',
    );
  } catch (notifyError) {
    console.error('Failed to notify user of exhausted job', { whatsappNumber, notifyError });
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
        console.error('Failed to mark reminder as failed', { reminderId, dbError });
      });
    },
  },
];

const workers = QUEUE_CONFIGS.map(({ name, handler, concurrency, onExhausted }) => {
  const worker = new Worker(name, handler, { connection, concurrency });
  worker.on('failed', (job, error) => {
    console.error(`Job failed [${name}]`, { jobId: job?.id, error, attemptsMade: job?.attemptsMade });
    if (job && isExhausted(job) && onExhausted) void onExhausted(job, error);
  });
  return worker;
});

console.log('ZapBuddy worker started', { queues: workers.map((w) => w.name) });

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
