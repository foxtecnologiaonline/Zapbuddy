import { Worker, type Job } from 'bullmq';
import {
  getRedisConnection,
  QUEUE_NAMES,
  sendWhatsappTextMessage,
  type IncomingMessageJob,
  type AudioTranscriptionJob,
} from '@zapbuddy/core';
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

function logJobFailed(queueName: string, job: Job | undefined, error: Error): void {
  console.error(`Job failed [${queueName}]`, { jobId: job?.id, error, attemptsMade: job?.attemptsMade });
}

const incomingMessageWorker = new Worker(QUEUE_NAMES.incomingMessage, handleIncomingMessage, {
  connection,
  concurrency: 5,
});
incomingMessageWorker.on('failed', (job, error) => {
  logJobFailed('incoming-message', job, error);
  if (job && isExhausted(job)) {
    void notifyUserOfExhaustedJob((job.data as IncomingMessageJob).whatsappNumber);
  }
});

const audioTranscriptionWorker = new Worker(QUEUE_NAMES.audioTranscription, handleAudioTranscription, {
  connection,
  concurrency: 3,
});
audioTranscriptionWorker.on('failed', (job, error) => {
  logJobFailed('audio-transcription', job, error);
  if (job && isExhausted(job)) {
    void notifyUserOfExhaustedJob((job.data as AudioTranscriptionJob).whatsappNumber);
  }
});

const reminderDispatchWorker = new Worker(QUEUE_NAMES.reminderDispatch, handleReminderDispatch, {
  connection,
  concurrency: 5,
});
reminderDispatchWorker.on('failed', (job, error) => {
  logJobFailed('reminder-dispatch', job, error);
  // Sem notificação de fallback ao usuário aqui: se o próprio envio ao
  // WhatsApp é o que está falhando (ex.: fora da janela de 24h da Cloud
  // API, que exige template aprovado pra mensagem livre nesse caso —
  // limitação da Meta, não corrigível em código), mandar "deu erro" teria
  // o mesmo problema. Só marca 'failed' no banco quando esgota as
  // tentativas, pra não ficar preso em 'pending' pra sempre e indistinguível
  // de um lembrete que ainda vai disparar.
  if (job && isExhausted(job)) {
    const reminderId = job.data.reminderId as string;
    void markReminderFailed(reminderId, error.message).catch((dbError) => {
      console.error('Failed to mark reminder as failed', { reminderId, dbError });
    });
  }
});

const workers = [incomingMessageWorker, audioTranscriptionWorker, reminderDispatchWorker];

console.log('ZapBuddy worker started', { queues: workers.map((w) => w.name) });

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
