import type { Job } from 'bullmq';
import { dispatchWebhookEvent, type WebhookDispatchJob } from '@zapbuddy/core';

export async function handleWebhookDispatch(job: Job<WebhookDispatchJob>): Promise<void> {
  const { accountId, eventType, payload } = job.data;
  await dispatchWebhookEvent(accountId, eventType, payload);
}
