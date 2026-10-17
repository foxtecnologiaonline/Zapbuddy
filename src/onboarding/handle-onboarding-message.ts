import type { Client } from '../types/client';
import type { InboundMessage } from '../whatsapp/parse-webhook-payload';
import { setOnboardingStep, markOnboardingComplete } from '../repositories/clients';
import { sendWhatsAppTextMessage, sendWhatsAppTextMessages } from '../whatsapp/send-message';
import { WELCOME_MESSAGES, ASK_NAME_AGAIN_MESSAGE, buildOnboardingCompleteMessage } from './messages';
import { logger } from '../lib/logger';

export async function handleOnboardingMessage(client: Client, message: InboundMessage): Promise<void> {
  const context = { clientId: client.id, whatsappId: client.whatsappId, messageId: message.messageId };

  if (client.onboardingStep === 'awaiting_name') {
    const name = message.text?.trim();

    if (!name) {
      // Áudio/imagem/sticker ou texto vazio: ainda não dá pra transcrever
      // nem aceitar como nome, então só pede de novo em texto.
      logger.info('onboarding.ask_name_again', { ...context, messageType: message.type });
      await sendWhatsAppTextMessage(client.whatsappId, ASK_NAME_AGAIN_MESSAGE);
      return;
    }

    await markOnboardingComplete(client.id, name);
    logger.info('onboarding.completed', { ...context, name });

    try {
      await sendWhatsAppTextMessage(client.whatsappId, buildOnboardingCompleteMessage(name));
    } catch (error) {
      // O onboarding já foi persistido (status active) — não deixa o envio
      // falho propagar: um retry do BullMQ re-derivaria a rota com esse
      // novo status e mandaria essa mesma mensagem (o nome digitado) pro
      // orquestrador, em vez de reenviar a confirmação.
      logger.error('onboarding.confirmation_send_failed', { ...context, error });
    }
    return;
  }

  // Primeiro contato (onboardingStep === 'new'), seja texto, áudio ou imagem.
  logger.info('onboarding.welcome_sent', context);
  await sendWhatsAppTextMessages(client.whatsappId, WELCOME_MESSAGES);
  await setOnboardingStep(client.id, 'awaiting_name');
}
