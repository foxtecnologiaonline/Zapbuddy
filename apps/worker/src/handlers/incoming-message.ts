import type { Job } from 'bullmq';
import { findUserById, logger } from '@zapbuddy/db';
import {
  orchestrateTurn,
  sendWhatsappTextMessage,
  breakLinesAfterSentences,
  getCachedReply,
  setCachedReply,
  getOnboardingNudgeQueue,
  type IncomingMessageJob,
} from '@zapbuddy/core';

/**
 * Agenda os dois empurrões de reengajamento (2h, 24h — ADR 0005, sugestão
 * 4) toda vez que vemos alguém com onboarding incompleto, não só na
 * primeira mensagem — jobId determinístico por usuário+estágio faz o BullMQ
 * dedupar sozinho, então chamar isso de novo em mensagens seguintes é
 * barato e inofensivo (nunca cria um segundo agendamento). O handler
 * (onboarding-nudge.ts) revalida onboarding_completed_at antes de mandar, o
 * que já cobre o caso de completar o cadastro antes do disparo.
 */
async function scheduleOnboardingNudges(userId: string, whatsappNumber: string): Promise<void> {
  const queue = getOnboardingNudgeQueue();
  await Promise.all([
    queue.add(
      'nudge',
      { userId, whatsappNumber, stage: '2h' },
      { delay: 2 * 60 * 60 * 1000, jobId: `onboarding-nudge:2h:${userId}` },
    ),
    queue.add(
      'nudge',
      { userId, whatsappNumber, stage: '24h' },
      { delay: 24 * 60 * 60 * 1000, jobId: `onboarding-nudge:24h:${userId}` },
    ),
  ]);
}

export async function handleIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { userId, text, waMessageId } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    logger.error('incoming_message_user_not_found', { userId, waMessageId });
    return;
  }

  if (!user.onboarding_completed_at) {
    await scheduleOnboardingNudges(user.id, user.whatsapp_number).catch((error) => {
      logger.error('onboarding_nudge_schedule_failed', { userId, error: error instanceof Error ? error.message : String(error) });
    });
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

  // Formatado só no envio, não no cache: a resposta crua continua sendo a
  // mesma pra reentrega, e a quebra de linha vale mesmo quando vem do cache.
  await sendWhatsappTextMessage(user.whatsapp_number, breakLinesAfterSentences(replyText));
}
