import { randomBytes } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import type { WebhookSubscription, WebhookEventTypePublic } from '../types.js';

export interface CreatedWebhookSubscription {
  id: string;
  secret: string;
}

/** `secret` só existe neste retorno e na coluna (precisa ser lido de novo pra assinar cada entrega — por isso não é hash, diferente de api_keys). */
export async function createWebhookSubscription(
  accountId: string,
  url: string,
  eventTypes: WebhookEventTypePublic[],
): Promise<CreatedWebhookSubscription> {
  const secret = randomBytes(24).toString('base64url');

  const { data, error } = await getSupabaseClient()
    .from('webhook_subscriptions')
    .insert({ account_id: accountId, url, secret, event_types: eventTypes })
    .select('id')
    .single();

  if (error) throw error;
  return { id: (data as { id: string }).id, secret };
}

export async function listWebhookSubscriptions(accountId: string): Promise<WebhookSubscription[]> {
  const { data, error } = await getSupabaseClient()
    .from('webhook_subscriptions')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as WebhookSubscription[];
}

/** Assinaturas ativas (não desabilitadas) da conta que escutam esse tipo de evento — usado pelo dispatcher. */
export async function listActiveSubscriptionsForEvent(
  accountId: string,
  eventType: WebhookEventTypePublic,
): Promise<WebhookSubscription[]> {
  const { data, error } = await getSupabaseClient()
    .from('webhook_subscriptions')
    .select('*')
    .eq('account_id', accountId)
    .is('disabled_at', null)
    .contains('event_types', [eventType]);

  if (error) throw error;
  return (data ?? []) as WebhookSubscription[];
}

export async function disableWebhookSubscription(accountId: string, subscriptionId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('webhook_subscriptions')
    .update({ disabled_at: new Date().toISOString() })
    .eq('id', subscriptionId)
    .eq('account_id', accountId);

  if (error) throw error;
}

export async function logWebhookDelivery(
  subscriptionId: string,
  eventType: string,
  outcome: { success: boolean; statusCode?: number; error?: string },
): Promise<void> {
  const { error } = await getSupabaseClient().from('webhook_delivery_logs').insert({
    subscription_id: subscriptionId,
    event_type: eventType,
    success: outcome.success,
    status_code: outcome.statusCode ?? null,
    error: outcome.error ?? null,
  });
  if (error) throw error;
}
