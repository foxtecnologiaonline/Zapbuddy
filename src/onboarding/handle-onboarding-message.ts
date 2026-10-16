import type { Client } from '../types/client';
import type { InboundTextMessage } from '../whatsapp/parse-webhook-payload';
import { setOnboardingStep, markOnboardingComplete } from '../repositories/clients';
import { sendWhatsAppTextMessage, sendWhatsAppTextMessages } from '../whatsapp/send-message';
import { WELCOME_MESSAGES, buildOnboardingCompleteMessage } from './messages';

export async function handleOnboardingMessage(client: Client, message: InboundTextMessage): Promise<void> {
  if (client.onboardingStep === 'awaiting_name') {
    const name = message.text.trim();
    await markOnboardingComplete(client.id, name);
    await sendWhatsAppTextMessage(client.whatsappId, buildOnboardingCompleteMessage(name));
    return;
  }

  // Primeiro contato (onboardingStep === 'new', ou ainda não setado).
  await sendWhatsAppTextMessages(client.whatsappId, WELCOME_MESSAGES);
  await setOnboardingStep(client.id, 'awaiting_name');
}
