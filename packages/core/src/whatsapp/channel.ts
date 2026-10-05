import { CloudApiChannel } from './cloud-api-channel.js';
import { EvolutionChannel } from './evolution-channel.js';
import type { AudioRef, WhatsappChannel } from './types.js';

let cached: WhatsappChannel | null = null;

/**
 * Seleciona o canal pela env var WHATSAPP_CHANNEL_PROVIDER. Default é
 * 'cloud-api' (WhatsApp Cloud API oficial) — o único canal aprovado para
 * produção com usuários reais. 'evolution' é opt-in explícito, só para
 * staging/contingência (ver amendamento no CLAUDE.md).
 */
export function getWhatsappChannel(): WhatsappChannel {
  if (cached) return cached;

  const provider = process.env.WHATSAPP_CHANNEL_PROVIDER ?? 'cloud-api';
  if (provider === 'evolution') {
    cached = new EvolutionChannel();
  } else if (provider === 'cloud-api') {
    cached = new CloudApiChannel();
  } else {
    throw new Error(`WHATSAPP_CHANNEL_PROVIDER desconhecido: ${provider}`);
  }
  return cached;
}

export async function sendWhatsappTextMessage(to: string, body: string): Promise<void> {
  await getWhatsappChannel().sendText(to, body);
}

export async function downloadWhatsappAudio(ref: AudioRef): Promise<{ buffer: Buffer; mimeType: string }> {
  return getWhatsappChannel().downloadAudio(ref);
}

export type { AudioRef, WhatsappChannel } from './types.js';
