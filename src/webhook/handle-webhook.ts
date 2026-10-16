import { resolveClientForInboundMessage, InvalidPhoneNumberError } from './inbound-message';
import { parseInboundMessage } from '../whatsapp/parse-webhook-payload';
import { verifyWhatsAppSignature } from '../whatsapp/verify-signature';
import { markMessageProcessedOnce } from '../repositories/processed-messages';
import { isRateLimited } from '../lib/rate-limit';
import { enqueueMessageProcessing } from '../queue/queue';
import { logger } from '../lib/logger';

export interface WebhookRequest {
  rawBody: string;
  signatureHeader: string | null;
}

export class InvalidWebhookSignatureError extends Error {}

/**
 * Ponto de entrada de toda mensagem recebida via WhatsApp Cloud API.
 * Verifica assinatura, dedup por messageId, rate limit por número, garante
 * o cliente (cria/valida) e enfileira o processamento — quem manda a
 * resposta de volta pro WhatsApp é o worker, fora do ciclo de resposta
 * deste webhook (responde rápido pra Meta, sem depender da latência da
 * Graph API).
 */
export async function handleWebhookRequest({ rawBody, signatureHeader }: WebhookRequest): Promise<void> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) throw new Error('WHATSAPP_APP_SECRET não configurado');

  if (!verifyWhatsAppSignature(rawBody, signatureHeader, appSecret)) {
    throw new InvalidWebhookSignatureError('Assinatura do webhook inválida');
  }

  const body = JSON.parse(rawBody);
  const inboundMessage = parseInboundMessage(body);

  if (!inboundMessage) return;

  const isFirstTimeSeen = await markMessageProcessedOnce(inboundMessage.messageId);
  if (!isFirstTimeSeen) {
    logger.info('webhook.duplicate_message_ignored', { messageId: inboundMessage.messageId });
    return;
  }

  if (await isRateLimited(inboundMessage.from)) {
    logger.warn('webhook.rate_limited', { whatsappId: inboundMessage.from, messageId: inboundMessage.messageId });
    return;
  }

  let client;
  try {
    ({ client } = await resolveClientForInboundMessage(inboundMessage.from));
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      logger.warn('webhook.invalid_phone_number', {
        messageId: inboundMessage.messageId,
        error: error.message,
      });
      return;
    }
    throw error;
  }

  await enqueueMessageProcessing({ clientId: client.id, message: inboundMessage });
}
