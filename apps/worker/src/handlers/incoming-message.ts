import type { Job } from 'bullmq';
import { findUserById } from '@zapbuddy/db';
import {
  orchestrateTurn,
  sendWhatsappTextMessage,
  getCachedReply,
  setCachedReply,
  type IncomingMessageJob,
} from '@zapbuddy/core';

export async function handleIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { userId, text, waMessageId } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    // eslint-disable-next-line no-console
    console.error('incoming-message: user not found', { userId });
    return;
  }

  // Idempotência: se este job já rodou a IA antes (ex.: tentativa anterior
  // falhou só no envio ao WhatsApp), reusa a resposta já gerada em vez de
  // rodar orchestrateTurn de novo — evita duplicar efeitos de tool call.
  let replyText = await getCachedReply(waMessageId);
  if (replyText === null) {
    const result = await orchestrateTurn({ user, messageText: text, messageSource: 'text' });
    replyText = result.replyText;
    await setCachedReply(waMessageId, replyText);
  }

  await sendWhatsappTextMessage(user.whatsapp_number, replyText);
}
