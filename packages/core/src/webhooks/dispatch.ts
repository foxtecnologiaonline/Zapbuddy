import { createHmac } from 'node:crypto';
import { listActiveSubscriptionsForEvent, logWebhookDelivery, logger, type WebhookEventTypePublic } from '@zapbuddy/db';
import { fetchWithRetry } from '../whatsapp/http-retry.js';
import { getWebhookDispatchQueue } from '../queues/definitions.js';

/**
 * Enfileira o evento pra entrega assíncrona (ADR 0003, decisão 5) — chamado
 * de dentro de uma tool (record_transaction, complete_task) logo depois da
 * escrita ter sido confirmada. Nunca síncrono e nunca lança: uma falha ao
 * enfileirar não pode derrubar a confirmação ao usuário no WhatsApp, que já
 * aconteceu de verdade antes desta chamada.
 */
export function enqueueWebhookEvent(accountId: string, eventType: WebhookEventTypePublic, payload: Record<string, unknown>): void {
  void getWebhookDispatchQueue()
    .add('dispatch', { accountId, eventType, payload })
    .catch((error) =>
      logger.error('webhook_enqueue_failed', { accountId, eventType, error: error instanceof Error ? error.message : String(error) }),
    );
}

function signPayload(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Entrega o evento pra toda assinatura ativa da conta que escuta esse tipo —
 * best-effort (nunca lança: uma assinatura externa quebrada não pode afetar
 * o resto do sistema). Chamado pelo handler da fila `webhook-dispatch`
 * (ADR 0003, decisão 5), nunca sincronamente de dentro de uma tool.
 */
export async function dispatchWebhookEvent(
  accountId: string,
  eventType: WebhookEventTypePublic,
  payload: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await listActiveSubscriptionsForEvent(accountId, eventType);
  if (subscriptions.length === 0) return;

  const rawBody = JSON.stringify({ event: eventType, data: payload, sent_at: new Date().toISOString() });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const response = await fetchWithRetry(
          subscription.url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-ZapBuddy-Signature': `sha256=${signPayload(subscription.secret, rawBody)}`,
              'X-ZapBuddy-Event': eventType,
            },
            body: rawBody,
          },
          10_000,
        );

        await logWebhookDelivery(subscription.id, eventType, {
          success: response.ok,
          statusCode: response.status,
        });
      } catch (error) {
        await logWebhookDelivery(subscription.id, eventType, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
