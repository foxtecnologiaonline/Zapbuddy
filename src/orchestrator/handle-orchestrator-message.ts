import type { Client } from '../types/client';
import type { InboundMessage } from '../whatsapp/parse-webhook-payload';
import { runOrchestrator } from './run-orchestrator';
import { sendWhatsAppTextMessage } from '../whatsapp/send-message';
import { logger } from '../lib/logger';

// Áudio/imagem ainda não têm transcrição/processamento (fila da Fase 2 do
// roadmap). Por ora, só pede pra escrever.
const NON_TEXT_FALLBACK = 'Por enquanto eu só processo mensagens em texto 🙂 Pode escrever?';

export async function handleOrchestratorMessage(client: Client, message: InboundMessage): Promise<void> {
  if (!message.text) {
    await sendWhatsAppTextMessage(client.whatsappId, NON_TEXT_FALLBACK);
    return;
  }

  const reply = await runOrchestrator(client.id, message.text);

  logger.info('orchestrator.replied', { clientId: client.id, whatsappId: client.whatsappId, messageId: message.messageId });
  await sendWhatsAppTextMessage(client.whatsappId, reply);
}
