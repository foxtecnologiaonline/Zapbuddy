import {
  getAudioTranscriptionQueue,
  getIncomingMessageQueue,
  getReminderDispatchQueue,
  getDocumentUploadQueue,
  getInsightsSweepQueue,
  getInsightsGenerateQueue,
  getWebhookDispatchQueue,
  QUEUE_NAMES,
} from './definitions.js';

export interface QueueCounts {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/** Contagem de jobs por status, pra o card "Fila" do admin — leitura direta do BullMQ/Redis, sem passar pelo Postgres. */
export async function getAllQueueCounts(): Promise<QueueCounts[]> {
  const queues = [
    { name: QUEUE_NAMES.incomingMessage, queue: getIncomingMessageQueue() },
    { name: QUEUE_NAMES.audioTranscription, queue: getAudioTranscriptionQueue() },
    { name: QUEUE_NAMES.reminderDispatch, queue: getReminderDispatchQueue() },
    { name: QUEUE_NAMES.documentUpload, queue: getDocumentUploadQueue() },
    { name: QUEUE_NAMES.insightsSweep, queue: getInsightsSweepQueue() },
    { name: QUEUE_NAMES.insightsGenerate, queue: getInsightsGenerateQueue() },
    { name: QUEUE_NAMES.webhookDispatch, queue: getWebhookDispatchQueue() },
  ];

  return Promise.all(
    queues.map(async ({ name, queue }) => {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
      return {
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
      };
    }),
  );
}
