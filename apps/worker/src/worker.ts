import { Worker } from 'bullmq';
import {
  getRedisConnection,
  QUEUE_NAMES,
  sendWhatsappTextMessage,
  type AudioTranscriptionJob,
  type IncomingMessageJob,
  type ReminderDispatchJob,
} from '@zapbuddy/core';
import { markReminderFailed } from '@zapbuddy/db';
import { handleIncomingMessage } from './handlers/incoming-message.js';
import { handleAudioTranscription } from './handlers/audio-transcription.js';
import { handleReminderDispatch } from './handlers/reminder-dispatch.js';

const connection = getRedisConnection();

const incomingMessageWorker = new Worker(QUEUE_NAMES.incomingMessage, handleIncomingMessage, {
  connection,
  concurrency: 5,
});
const audioTranscriptionWorker = new Worker(QUEUE_NAMES.audioTranscription, handleAudioTranscription, {
  connection,
  concurrency: 3,
});
const reminderDispatchWorker = new Worker(QUEUE_NAMES.reminderDispatch, handleReminderDispatch, {
  connection,
  concurrency: 5,
});

const workers = [incomingMessageWorker, audioTranscriptionWorker, reminderDispatchWorker];

/**
 * Avisa o usuário SÓ quando o job esgotou todas as tentativas (ver
 * DEFAULT_JOB_OPTIONS em queues/definitions.ts) — nunca a cada retry
 * intermediário, senão a pessoa recebe "não consegui processar" várias
 * vezes seguidas enquanto o BullMQ ainda está tentando de novo por trás.
 */
async function notifyUserOfExhaustedJob(
  whatsappNumber: string,
  attemptsMade: number,
  maxAttempts: number | undefined,
): Promise<void> {
  if (attemptsMade < (maxAttempts ?? 1)) return;
  try {
    await sendWhatsappTextMessage(
      whatsappNumber,
      'Desculpa, tive um problema técnico pra processar sua última mensagem. Pode mandar de novo?',
    );
  } catch (notifyError) {
    // eslint-disable-next-line no-console
    console.error('Failed to notify user of exhausted job', { whatsappNumber, notifyError });
  }
}

incomingMessageWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('Job failed [incoming-message]', { jobId: job?.id, error, attemptsMade: job?.attemptsMade });
  if (job) {
    const data = job.data as IncomingMessageJob;
    void notifyUserOfExhaustedJob(data.whatsappNumber, job.attemptsMade, job.opts.attempts);
  }
});

audioTranscriptionWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('Job failed [audio-transcription]', { jobId: job?.id, error, attemptsMade: job?.attemptsMade });
  if (job) {
    const data = job.data as AudioTranscriptionJob;
    void notifyUserOfExhaustedJob(data.whatsappNumber, job.attemptsMade, job.opts.attempts);
  }
});

reminderDispatchWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('Job failed [reminder-dispatch]', { jobId: job?.id, error, attemptsMade: job?.attemptsMade });
  // Sem notificação de fallback ao usuário aqui: se o próprio envio ao
  // WhatsApp é o que está falhando (ex.: fora da janela de 24h da Cloud
  // API, que exige template aprovado pra mensagem livre nesse caso —
  // limitação da Meta, não corrigível em código), mandar "deu erro" teria
  // o mesmo problema. Só marca 'failed' no banco quando esgota as
  // tentativas, pra não ficar preso em 'pending' pra sempre e indistinguível
  // de um lembrete que ainda vai disparar.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    const data = job.data as ReminderDispatchJob;
    void markReminderFailed(data.reminderId, error.message).catch((dbError) => {
      // eslint-disable-next-line no-console
      console.error('Failed to mark reminder as failed', { reminderId: data.reminderId, dbError });
    });
  }
});

// eslint-disable-next-line no-console
console.log('ZapBuddy worker started', { queues: workers.map((w) => w.name) });

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
