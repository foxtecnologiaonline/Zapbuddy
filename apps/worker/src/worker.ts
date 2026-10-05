import { Worker } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES } from '@zapbuddy/core';
import { handleIncomingMessage } from './handlers/incoming-message.js';
import { handleAudioTranscription } from './handlers/audio-transcription.js';
import { handleReminderDispatch } from './handlers/reminder-dispatch.js';

const connection = getRedisConnection();

const workers = [
  new Worker(QUEUE_NAMES.incomingMessage, handleIncomingMessage, { connection, concurrency: 5 }),
  new Worker(QUEUE_NAMES.audioTranscription, handleAudioTranscription, { connection, concurrency: 3 }),
  new Worker(QUEUE_NAMES.reminderDispatch, handleReminderDispatch, { connection, concurrency: 5 }),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    // eslint-disable-next-line no-console
    console.error(`Job failed [${worker.name}]`, { jobId: job?.id, error });
  });
}

// eslint-disable-next-line no-console
console.log('ZapBuddy worker started', { queues: workers.map((w) => w.name) });

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
