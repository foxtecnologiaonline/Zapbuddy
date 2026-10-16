import { resolveClientForInboundMessage, InvalidPhoneNumberError } from './inbound-message';
import { parseInboundMessage } from '../whatsapp/parse-webhook-payload';
import { verifyWhatsAppSignature } from '../whatsapp/verify-signature';
import { markMessageProcessedOnce } from '../repositories/processed-messages';
import { handleOnboardingMessage } from '../onboarding/handle-onboarding-message';
import { handleOrchestratorMessage } from '../orchestrator/handle-orchestrator-message';
import { logger } from '../lib/logger';

export interface WebhookRequest {
  rawBody: string;
  signatureHeader: string | null;
}

export class InvalidWebhookSignatureError extends Error {}

/**
 * Ponto de entrada de toda mensagem recebida via WhatsApp Cloud API.
 * Verifica a assinatura da Meta, dedup por messageId, extrai a mensagem e
 * decide, via resolveClientForInboundMessage, se o remetente vai pro
 * fluxo de onboarding ou pro orquestrador de IA.
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

  let route;
  try {
    route = await resolveClientForInboundMessage(inboundMessage.from);
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

  if (route.kind === 'onboarding') {
    await handleOnboardingMessage(route.client, inboundMessage);
  } else {
    await handleOrchestratorMessage(route.client, inboundMessage);
  }
}
