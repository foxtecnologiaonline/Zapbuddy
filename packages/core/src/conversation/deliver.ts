import { logger } from '@zapbuddy/db';
import { sendWhatsappReaction, sendWhatsappTextMessage, sendWhatsappTyping } from '../whatsapp/channel.js';
import { breakLinesAfterSentences } from '../whatsapp/format.js';
import { bubbleDelayMs, splitIntoBubbles } from './bubbles.js';

/**
 * Entrega a resposta do Tom como uma pessoa mandaria (sugestões #1 e #3):
 * - agradecimento puro → reação ❤️ na mensagem dela (texto curto só se a reação falhar);
 * - resposta com linhas em branco → até 3 balões, com "digitando…" e uma pausa
 *   curta entre eles.
 *
 * Falha no PRIMEIRO balão propaga (o retry da fila reenvia, nada saiu ainda).
 * Falha depois dele nunca propaga: o primeiro já foi entregue e um retry
 * duplicaria — tenta mandar o resto num balão só e, se não der, só registra.
 */

export interface ReplyEnvelope {
  text: string;
  reaction?: string;
}

const ENVELOPE_PREFIX = '{"v":1';

/** Formato guardado no cache de idempotência (texto simples antigo continua válido). */
export function encodeReply(reply: ReplyEnvelope): string {
  return reply.reaction ? JSON.stringify({ v: 1, text: reply.text, reaction: reply.reaction }) : reply.text;
}

export function decodeReply(cached: string): ReplyEnvelope {
  if (cached.startsWith(ENVELOPE_PREFIX)) {
    try {
      const parsed = JSON.parse(cached) as { text?: unknown; reaction?: unknown };
      if (typeof parsed.text === 'string') return { text: parsed.text, reaction: typeof parsed.reaction === 'string' ? parsed.reaction : undefined };
    } catch {
      // Texto que só parece JSON: segue como texto.
    }
  }
  return { text: cached };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DeliverReplyInput {
  to: string;
  /** Id da mensagem recebida (necessário pra reação e "digitando…"); null nos fluxos sem ele. */
  waMessageId: string | null;
  reply: ReplyEnvelope;
}

export async function deliverReply(input: DeliverReplyInput): Promise<void> {
  const { to, waMessageId, reply } = input;

  if (reply.reaction && waMessageId) {
    if (await sendWhatsappReaction(to, waMessageId, reply.reaction)) return;
  }

  const bubbles = splitIntoBubbles(reply.text).map(breakLinesAfterSentences);
  for (const [index, bubble] of bubbles.entries()) {
    if (index > 0) {
      if (waMessageId) await sendWhatsappTyping(to, waMessageId);
      await sleep(bubbleDelayMs(bubble));
    }
    try {
      await sendWhatsappTextMessage(to, bubble);
    } catch (error) {
      if (index === 0) throw error;
      logger.error('bubble_delivery_failed', { index, error: error instanceof Error ? error.message : String(error) });
      const rest = bubbles.slice(index).join('\n\n');
      try {
        await sendWhatsappTextMessage(to, rest);
      } catch (restError) {
        logger.error('bubble_rest_delivery_failed', { error: restError instanceof Error ? restError.message : String(restError) });
      }
      return;
    }
  }
}
