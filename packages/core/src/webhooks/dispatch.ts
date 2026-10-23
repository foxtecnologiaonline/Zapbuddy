import { createHmac, randomUUID } from 'node:crypto';
import { listActiveSubscriptionsForEvent, logWebhookDelivery, logger, type WebhookEventTypePublic } from '@zapbuddy/db';
import { fetchWithRetry } from '../whatsapp/http-retry.js';
import { getWebhookDispatchQueue } from '../queues/definitions.js';
import { assertPublicHttpsUrl } from '../security/ssrf-guard.js';

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
 * Entrega o evento pra toda assinatura ativa da conta que escuta esse tipo.
 * Uma assinatura (URL de terceiro) com erro nunca derruba as outras — por
 * isso cada entrega tem seu próprio try/catch — mas ao final, se QUALQUER
 * uma falhou (exceção ou resposta não-2xx), a função lança: isso é o que
 * faz o job da fila `webhook-dispatch` ser marcado 'failed' e o BullMQ
 * aplicar o retry com backoff já configurado (DEFAULT_JOB_OPTIONS,
 * queues/definitions.ts) — sem lançar aqui, uma falha de entrega nunca
 * seria retentada, apesar do ADR 0003 (decisão 5) prometer "mesmo padrão de
 * retry das outras filas". Reentrega pode duplicar uma entrega que já
 * tinha ido com sucesso pra outra assinatura da mesma conta — aceitável
 * (webhook é "at-least-once" por natureza; por isso o payload carrega um
 * `id` por evento, pro consumidor conseguir dedupe).
 */
export async function dispatchWebhookEvent(
  accountId: string,
  eventType: WebhookEventTypePublic,
  payload: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await listActiveSubscriptionsForEvent(accountId, eventType);
  if (subscriptions.length === 0) return;

  const rawBody = JSON.stringify({ id: randomUUID(), event: eventType, data: payload, sent_at: new Date().toISOString() });

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await assertPublicHttpsUrl(subscription.url);
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
            // Nunca segue redirect: um 302 pra rede interna contornaria a checagem acima.
            redirect: 'manual',
          },
          10_000,
        );

        await logWebhookDelivery(subscription.id, eventType, {
          success: response.ok,
          statusCode: response.status,
        });
        return response.ok;
      } catch (error) {
        await logWebhookDelivery(subscription.id, eventType, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }),
  );

  if (results.some((ok) => !ok)) {
    throw new Error(`Falha ao entregar webhook ${eventType} pra ${results.filter((ok) => !ok).length}/${results.length} assinatura(s) da conta ${accountId}`);
  }
}
