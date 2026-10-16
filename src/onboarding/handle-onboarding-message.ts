import type { Client } from '../types/client';
import type { InboundMessage } from '../whatsapp/parse-webhook-payload';
import { setOnboardingStep, markOnboardingComplete } from '../repositories/clients';
import { sendWhatsAppTextMessage, sendWhatsAppTextMessages } from '../whatsapp/send-message';
import { WELCOME_MESSAGES, buildOnboardingCompleteMessage } from './messages';

export async function handleOnboardingMessage(client: Client, message: InboundMessage): Promise<void> {
  if (client.onboardingStep === 'awaiting_name') {
    const name = message.text?.trim();

    if (!name) {
      // Áudio/imagem/sticker ou texto vazio: ainda não dá pra transcrever
      // nem aceitar como nome, então só pede de novo em texto.
      await sendWhatsAppTextMessage(client.whatsappId, 'Não entendi 🤔\nPode me dizer seu nome em texto?');
      return;
    }

    await markOnboardingComplete(client.id, name);
    await sendWhatsAppTextMessage(client.whatsappId, buildOnboardingCompleteMessage(name));
    return;
  }

  // Primeiro contato (onboardingStep === 'new'), seja texto, áudio ou imagem.
  await sendWhatsAppTextMessages(client.whatsappId, WELCOME_MESSAGES);
  await setOnboardingStep(client.id, 'awaiting_name');
}
