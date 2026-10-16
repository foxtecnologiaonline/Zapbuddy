import type { Client } from '../types/client';
import type { InboundMessage } from '../whatsapp/parse-webhook-payload';
import { logger } from '../lib/logger';

// TODO: orquestrador Claude + tools (finance, tasks, reminders). Por ora só loga.
export async function handleOrchestratorMessage(client: Client, message: InboundMessage): Promise<void> {
  logger.info('orchestrator.received', {
    clientId: client.id,
    whatsappId: client.whatsappId,
    messageId: message.messageId,
    type: message.type,
    text: message.text,
  });
}
