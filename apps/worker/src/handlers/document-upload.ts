import type { Job } from 'bullmq';
import { findUserById, getAccountForUser, createAccountForUser, redeemAccountInvite, uploadDocument, logger } from '@zapbuddy/db';
import {
  downloadWhatsappMedia,
  sendWhatsappTextMessage,
  MESSAGES,
  isAccessBlocked,
  INVITE_CODE_MESSAGE_PATTERN,
  type DocumentUploadJob,
} from '@zapbuddy/core';

/**
 * Upload nunca passa pelo LLM (ver ADR 0002, decisão 2) — é puramente
 * mecânico: baixa do WhatsApp, grava no Storage, confirma com mensagem fixa.
 * Resolve a conta igual ao orchestrator faria (mesmo "garante que toda
 * mensagem processada tem uma conta") — incluindo o convite: nada impede que
 * a primeiríssima mensagem de alguém convidado seja um documento (ex.: já
 * manda a legenda "entrar 482913" junto com o boleto), e sem checar isso
 * aqui essa pessoa ganhava uma conta solo própria, criada direto por
 * createAccountForUser, e nunca mais conseguia entrar na conta de quem a
 * convidou (account_members.user_id é único — uma vez com conta, não dá
 * pra trocar).
 */
export async function handleDocumentUpload(job: Job<DocumentUploadJob>): Promise<void> {
  const { userId, mediaRef, fileName, caption, waMessageId } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    logger.error('document_upload_user_not_found', { userId, waMessageId });
    return;
  }

  if (isAccessBlocked(user)) {
    await sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.trialBlocked);
    return;
  }

  const existingAccount = await getAccountForUser(userId);
  let account = existingAccount;
  if (!account) {
    const inviteCode = caption ? INVITE_CODE_MESSAGE_PATTERN.exec(caption)?.[1] : undefined;
    account = (inviteCode ? await redeemAccountInvite(inviteCode, userId) : null) ?? (await createAccountForUser(userId));
  }

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
