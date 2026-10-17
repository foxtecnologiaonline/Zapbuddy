import { Worker, type Job } from 'bullmq';
import { getRedis } from '../lib/redis';
import { PROCESS_MESSAGE_QUEUE_NAME, type ProcessMessageJobData } from './types';
import { findClientById } from '../repositories/clients';
import { routeKindForClient } from '../webhook/inbound-message';
import { handleOnboardingMessage } from '../onboarding/handle-onboarding-message';
import { handleOrchestratorMessage } from '../orchestrator/handle-orchestrator-message';
import { logger } from '../lib/logger';

// Busca o cliente de novo (em vez de confiar num snapshot salvo no job) pra
// que um retry do BullMQ sempre decida com o estado atual do banco — se a
// 1ª tentativa já avançou a etapa de onboarding antes de falhar no envio,
// o retry não re-executa a etapa anterior.
export async function processJob(job: Job<ProcessMessageJobData>): Promise<void> {
  const { clientId, message } = job.data;

  const client = await findClientById(clientId);
  if (!client) {
    logger.warn('queue.client_not_found', { clientId, messageId: message.messageId });
    return;
  }

  const routeKind = routeKindForClient(client);

  if (routeKind === 'onboarding') {
    await handleOnboardingMessage(client, message);
  } else {
    await handleOrchestratorMessage(client, message);
  }
}

export function startMessageWorker(): Worker<ProcessMessageJobData> {
  const worker = new Worker<ProcessMessageJobData>(PROCESS_MESSAGE_QUEUE_NAME, processJob, {
    connection: getRedis(),
  });

  worker.on('failed', (job, error) => {
    logger.error('queue.job_failed', { jobId: job?.id, error });
  });

  return worker;
}
