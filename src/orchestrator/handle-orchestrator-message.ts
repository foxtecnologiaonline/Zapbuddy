import type { Client } from '../types/client';
import type { InboundTextMessage } from '../whatsapp/parse-webhook-payload';

// TODO: orquestrador Claude + tools (finance, tasks, reminders). Por ora só loga.
export async function handleOrchestratorMessage(
  client: Client,
  message: InboundTextMessage,
): Promise<void> {
  console.log('[orchestrator]', { clientId: client.id, whatsappId: client.whatsappId, text: message.text });
}
