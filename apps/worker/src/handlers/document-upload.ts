import type { Job } from 'bullmq';
import { findUserById, getAccountForUser, createAccountForUser, uploadDocument, logger } from '@zapbuddy/db';
import { downloadWhatsappMedia, sendWhatsappTextMessage, MESSAGES, type DocumentUploadJob } from '@zapbuddy/core';

/**
 * Upload nunca passa pelo LLM (ver ADR 0002, decisão 2) — é puramente
 * mecânico: baixa do WhatsApp, grava no Storage, confirma com mensagem fixa.
 * Resolve a conta igual ao orchestrator faria (mesmo "garante que toda
 * mensagem processada tem uma conta"), mas sem o fluxo de convite — um
 * documento nunca é a primeira mensagem de alguém entrando com código.
 */
export async function handleDocumentUpload(job: Job<DocumentUploadJob>): Promise<void> {
  const { userId, mediaRef, fileName, caption, waMessageId } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    logger.error('document_upload_user_not_found', { userId, waMessageId });
    return;
  }

  const existingAccount = await getAccountForUser(userId);
  const account = existingAccount ?? (await createAccountForUser(userId));

  const { buffer, mimeType } = await downloadWhatsappMedia(mediaRef);
  await uploadDocument({
    accountId: account.accountId,
    uploadedByUserId: userId,
    fileName,
    mimeType,
    caption,
    buffer,
  });

  await sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.documentReceived(fileName));
}
