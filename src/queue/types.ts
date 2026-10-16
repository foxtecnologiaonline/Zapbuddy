import type { InboundMessage } from '../whatsapp/parse-webhook-payload';

export const PROCESS_MESSAGE_QUEUE_NAME = 'process-inbound-message';

export interface ProcessMessageJobData {
  clientId: string;
  message: InboundMessage;
}
