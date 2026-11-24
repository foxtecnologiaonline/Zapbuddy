import { logger } from '@zapbuddy/db';
import { CloudApiChannel } from './cloud-api-channel.js';
import { EvolutionChannel } from './evolution-channel.js';
import { splitForWhatsapp } from './split.js';
import { WhatsappWindowClosedError } from './template.js';
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

/**
 * Envia texto, dividindo o que passa do limite do WhatsApp (ver split.ts). Falha na PRIMEIRA parte propaga (o retry do job é
 * seguro: nada foi entregue). Falha numa parte POSTERIOR só é registrada: propagar faria o retry reenviar a primeira, que a
 * pessoa já recebeu (mesma regra dos balões em deliverReply).
 */
export async function sendWhatsappTextMessage(to: string, body: string): Promise<void> {
  const channel = getWhatsappChannel();
  const parts = splitForWhatsapp(body);
  for (const [index, part] of parts.entries()) {
    try {
      await channel.sendText(to, part);
    } catch (error) {
      if (index === 0) throw error;
      logger.warn('whatsapp_text_part_failed', { part: index + 1, of: parts.length, error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }
}

/** Template de lembrete configurado (env do worker), ou null: sem ele, lembrete fora da janela de 24h continua falhando como antes. */
export function getReminderTemplateConfig(): { name: string; language: string } | null {
  const name = process.env.WHATSAPP_REMINDER_TEMPLATE_NAME?.trim();
  if (!name) return null;
  return { name, language: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'pt_BR' };
}

/**
 * Entrega um lembrete: texto livre primeiro (dentro da janela de 24h é o que a pessoa vê, com a formatação do Tom). Se a Meta
 * recusar por janela fechada e houver template configurado, manda o template com a mensagem do lembrete como parâmetro — é o que
 * faz "me lembra de X amanhã" chegar mesmo pra quem não falou com o Tom no último dia. Sem template, propaga o erro (como antes).
 */
export async function sendWhatsappReminder(to: string, text: string, reminderMessage: string): Promise<'text' | 'template'> {
  try {
    await sendWhatsappTextMessage(to, text);
    return 'text';
  } catch (error) {
    if (!(error instanceof WhatsappWindowClosedError)) throw error;

    const template = getReminderTemplateConfig();
    const channel = getWhatsappChannel();
    if (!template || !channel.sendTemplate) {
      logger.warn('reminder_window_closed_no_template', {
        hint: 'Janela de 24h fechada e sem template: configure WHATSAPP_REMINDER_TEMPLATE_NAME no .env do worker (template UTILITY aprovado na Meta, 1 variável no corpo)',
      });
      throw error;
    }
    await channel.sendTemplate(to, { name: template.name, language: template.language, bodyParams: [reminderMessage] });
    logger.info('reminder_sent_via_template', { template: template.name });
    return 'template';
  }
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
export { WhatsappWindowClosedError } from './template.js';
