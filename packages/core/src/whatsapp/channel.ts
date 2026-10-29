import { CloudApiChannel } from './cloud-api-channel.js';
import { EvolutionChannel } from './evolution-channel.js';
import type { MediaRef, WhatsappChannel } from './types.js';

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

/** "Digitando…" — melhor esforço, nunca lança. */
export async function sendWhatsappTyping(to: string, waMessageId: string): Promise<void> {
  try {
    await getWhatsappChannel().sendTyping?.(to, waMessageId);
  } catch {
    // Enfeite.
  }
}

/** Reação com emoji a uma mensagem da pessoa. false = não foi possível (canal sem suporte ou falha); nunca lança. */
export async function sendWhatsappReaction(to: string, waMessageId: string, emoji: string): Promise<boolean> {
  try {
    const channel = getWhatsappChannel();
    return channel.sendReaction ? await channel.sendReaction(to, waMessageId, emoji) : false;
  } catch {
    return false;
  }
}

export async function downloadWhatsappMedia(ref: MediaRef): Promise<{ buffer: Buffer; mimeType: string }> {
  return getWhatsappChannel().downloadMedia(ref);
}

/** Usado pelo card de status do admin — nome do provider ativo + checagem de conexão dele (incluindo número conectado, quando disponível). */
export async function checkWhatsappConnection(): Promise<{ provider: MediaRef['provider']; ok: boolean; detail?: string; number?: string }> {
  const channel = getWhatsappChannel();
  const result = await channel.checkConnection();
  return { provider: channel.provider, ...result };
}

export type { ConnectionCheck, MediaRef, WhatsappChannel } from './types.js';
