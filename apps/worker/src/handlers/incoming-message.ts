import type { Job } from 'bullmq';
import { findUserById, logger } from '@zapbuddy/db';
import {
  orchestrateTurn,
  sendWhatsappTyping,
  deliverReply,
  encodeReply,
  decodeReply,
  getCachedReply,
  setCachedReply,
  type IncomingMessageJob,
  type ReplyEnvelope,
} from '@zapbuddy/core';

export async function handleIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { userId, text, waMessageId } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    logger.error('incoming_message_user_not_found', { userId, waMessageId });
    return;
  }

  // Idempotência: se este job já rodou a IA antes (ex.: tentativa anterior
  // falhou só no envio ao WhatsApp), reusa a resposta já gerada em vez de
  // rodar orchestrateTurn de novo — evita duplicar efeitos de tool call.
  let reply: ReplyEnvelope;
  let afterSend: (() => Promise<void>) | undefined;
  const cached = await getCachedReply(waMessageId);
  if (cached !== null) {
    reply = decodeReply(cached);
  } else {
    // "Digitando…" enquanto a IA pensa (melhor esforço, nunca lança).
    void sendWhatsappTyping(user.whatsapp_number, waMessageId);
    const result = await orchestrateTurn({ user, messageText: text, messageSource: 'text' });
    reply = { text: result.replyText, reaction: result.reaction };
    afterSend = result.afterSend;
    await setCachedReply(waMessageId, encodeReply(reply));
  }

  // Formatação (quebra de linha por frase) e balões acontecem só na entrega,
  // não no cache: a resposta crua é a mesma na reentrega.
  await deliverReply({ to: user.whatsapp_number, waMessageId, reply });

  // Manutenção depois da resposta (resumo da conversa): nunca atrasa nem derruba o envio.
  if (afterSend) {
    await afterSend().catch((error) => {
      logger.warn('after_send_failed', { userId, error: error instanceof Error ? error.message : String(error) });
    });
  }
}
