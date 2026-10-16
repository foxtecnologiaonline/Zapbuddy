import type { Client } from '../types/client';
import type { InboundMessage } from '../whatsapp/parse-webhook-payload';

// TODO: orquestrador Claude + tools (finance, tasks, reminders). Por ora só loga.
export async function handleOrchestratorMessage(client: Client, message: InboundMessage): Promise<void> {
  console.log('[orchestrator]', {
    clientId: client.id,
    whatsappId: client.whatsappId,
    type: message.type,
    text: message.text,
  });
}
