import type { Job } from 'bullmq';
import { findUserById } from '@zapbuddy/db';
import { orchestrateTurn, sendWhatsappTextMessage, type IncomingMessageJob } from '@zapbuddy/core';

export async function handleIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { userId, text } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    // eslint-disable-next-line no-console
    console.error('incoming-message: user not found', { userId });
    return;
  }

  const { replyText } = await orchestrateTurn({
    user,
    messageText: text,
    messageSource: 'text',
  });

  await sendWhatsappTextMessage(user.whatsapp_number, replyText);
}
