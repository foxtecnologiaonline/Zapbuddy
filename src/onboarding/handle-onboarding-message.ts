import type { Client } from '../types/client';
import type { InboundTextMessage } from '../whatsapp/parse-webhook-payload';

// TODO: fluxo de cadastro conversacional (MVP item 1). Por ora só loga.
export async function handleOnboardingMessage(
  client: Client,
  message: InboundTextMessage,
): Promise<void> {
  console.log('[onboarding]', { clientId: client.id, whatsappId: client.whatsappId, text: message.text });
}
