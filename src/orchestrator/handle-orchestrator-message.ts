import type { Client } from '../types/client';
import type { InboundMessage } from '../whatsapp/parse-webhook-payload';
import { runOrchestrator } from './run-orchestrator';
import { sendWhatsAppTextMessage } from '../whatsapp/send-message';
import { logger } from '../lib/logger';

// Áudio/imagem ainda não têm transcrição/processamento (fila da Fase 2 do
// roadmap). Por ora, só pede pra escrever.
const NON_TEXT_FALLBACK = 'Por enquanto eu só processo mensagens em texto 🙂 Pode escrever?';
const ORCHESTRATOR_ERROR_MESSAGE = 'Tive um problema pra processar isso agora. Pode tentar de novo? 🙏';

export async function handleOrchestratorMessage(client: Client, message: InboundMessage): Promise<void> {
  const context = { clientId: client.id, whatsappId: client.whatsappId, messageId: message.messageId };

  if (!message.text) {
    await sendWhatsAppTextMessage(client.whatsappId, NON_TEXT_FALLBACK);
    return;
  }

  try {
    const reply = await runOrchestrator(client.id, message.text);
    logger.info('orchestrator.replied', context);
    await sendWhatsAppTextMessage(client.whatsappId, reply);
  } catch (error) {
    // Nunca deixa isso propagar pro BullMQ: um retry re-executaria a conversa
    // inteira do zero, e se uma tool já persistiu algo (ex: um gasto) antes
    // da falha, o retry chamaria ela de novo — duplicando dado financeiro.
    logger.error('orchestrator.failed', { ...context, error });

    try {
      await sendWhatsAppTextMessage(client.whatsappId, ORCHESTRATOR_ERROR_MESSAGE);
    } catch (sendError) {
      logger.error('orchestrator.failed_to_notify', { ...context, error: sendError });
    }
  }
}
