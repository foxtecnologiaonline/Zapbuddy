import { Queue } from 'bullmq';
import { getRedis } from '../lib/redis';
import { PROCESS_MESSAGE_QUEUE_NAME, type ProcessMessageJobData } from './types';

let queue: Queue<ProcessMessageJobData> | undefined;

function getQueue(): Queue<ProcessMessageJobData> {
  if (!queue) {
    queue = new Queue<ProcessMessageJobData>(PROCESS_MESSAGE_QUEUE_NAME, { connection: getRedis() });
  }
  return queue;
}

// O webhook chama isso e responde na hora — quem manda a mensagem de
// verdade pro WhatsApp é o worker, fora do ciclo de resposta do webhook.
export async function enqueueMessageProcessing(data: ProcessMessageJobData): Promise<void> {
  await getQueue().add('process', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: 100,
  });
}
