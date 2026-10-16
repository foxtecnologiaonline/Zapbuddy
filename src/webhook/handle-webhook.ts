import { resolveClientForInboundMessage } from './inbound-message';
import { parseInboundTextMessage } from '../whatsapp/parse-webhook-payload';
import { verifyWhatsAppSignature } from '../whatsapp/verify-signature';
import { handleOnboardingMessage } from '../onboarding/handle-onboarding-message';
import { handleOrchestratorMessage } from '../orchestrator/handle-orchestrator-message';

export interface WebhookRequest {
  rawBody: string;
  signatureHeader: string | null;
}

export class InvalidWebhookSignatureError extends Error {}

/**
 * Ponto de entrada de toda mensagem recebida via WhatsApp Cloud API.
 * Verifica a assinatura da Meta, extrai a mensagem de texto e decide,
 * via resolveClientForInboundMessage, se o remetente vai pro fluxo de
 * onboarding ou pro orquestrador de IA.
 */
export async function handleWebhookRequest({ rawBody, signatureHeader }: WebhookRequest): Promise<void> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) throw new Error('WHATSAPP_APP_SECRET não configurado');

  if (!verifyWhatsAppSignature(rawBody, signatureHeader, appSecret)) {
    throw new InvalidWebhookSignatureError('Assinatura do webhook inválida');
  }

  const body = JSON.parse(rawBody);
  const inboundMessage = parseInboundTextMessage(body);

  if (!inboundMessage) return;

  const route = await resolveClientForInboundMessage(inboundMessage.from);

  if (route.kind === 'onboarding') {
    await handleOnboardingMessage(route.client, inboundMessage);
  } else {
    await handleOrchestratorMessage(route.client, inboundMessage);
  }
}
