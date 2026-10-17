import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
import type { WebhookChannel, WebhookEvent, WebhookEventType, WebhookEventStatus } from '../types.js';

export interface LogWebhookEventInput {
  channel: WebhookChannel;
  whatsappNumber?: string | null;
  eventType: WebhookEventType;
  status: WebhookEventStatus;
  rejectionReason?: string;
}

/**
 * Every hit on a WhatsApp webhook, accepted or rejected — the closest thing
 * this product has to a "visit" (there's no web page to instrument). Best-
 * effort like logToolCall: a logging failure must never block the webhook's
 * 200 response to Meta/Evolution.
 */
export async function logWebhookEvent(input: LogWebhookEventInput): Promise<void> {
  const { error } = await getSupabaseClient().from('webhook_events').insert({
    channel: input.channel,
    whatsapp_number: input.whatsappNumber ?? null,
    event_type: input.eventType,
    status: input.status,
    rejection_reason: input.rejectionReason ?? null,
  });

  if (error) {
    logger.error('webhook_event_write_failed', { channel: input.channel, error });
  }
}

export async function countWebhookEventsSince(sinceIso: string, status?: WebhookEventStatus): Promise<number> {
  let query = getSupabaseClient()
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sinceIso);
  if (status) query = query.eq('status', status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listRecentWebhookEvents(limit: number): Promise<WebhookEvent[]> {
  const { data, error } = await getSupabaseClient()
    .from('webhook_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as WebhookEvent[];
}
