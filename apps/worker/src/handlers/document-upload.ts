import type { Job } from 'bullmq';
import {
  findUserById,
  getAccountForUser,
  createAccountForUser,
  redeemAccountInvite,
  uploadDocument,
  saveDocumentAnalysis,
  logger,
  type User,
  type Document,
} from '@zapbuddy/db';
import {
  downloadWhatsappMedia,
  sendWhatsappTextMessage,
  orchestrateTurn,
  getCachedReply,
  setCachedReply,
  breakLinesAfterSentences,
  embedText,
  extractDocumentContent,
  getAnalyzableKind,
  isAccessBlocked,
  formatExtractionForConversation,
  buildExtractedText,
  buildDocumentEmbeddingText,
  toStoredExtraction,
  MESSAGES,
  INVITE_CODE_MESSAGE_PATTERN,
  type DocumentUploadJob,
} from '@zapbuddy/core';

/**
 * Guardar o arquivo é puramente mecânico e nunca passa pelo LLM (ADR 0002,
 * decisão 2) — baixa do WhatsApp e grava no Storage. Depois, SE for imagem ou
 * PDF legível, uma chamada de visão lê o conteúdo (extractDocumentContent),
 * grava o que foi lido (busca por conteúdo em find_document) e o orquestrador
 * responde sobre isso como numa conversa normal. Toda a camada de leitura é
 * bônus: qualquer falha nela cai na confirmação fixa "Salvei ...", nunca
 * vira erro pra pessoa nem reprocesso do job (que duplicaria o upload).
 *
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

  // Trial acabado/cancelado: nem guarda nem lê o arquivo (custo de Storage e de visão sem contrapartida) — mesma
  // porta fechada que o orquestrador aplica às mensagens de texto.
  if (isAccessBlocked(user)) {
    await sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.trialBlocked);
    return;
  }

  // Idempotência (mesma ideia de incoming-message): se uma tentativa anterior
  // já guardou o arquivo e gerou a resposta e só o envio falhou, reenvia sem
  // baixar/guardar/ler de novo.
  const cachedReply = await getCachedReply(waMessageId);
  if (cachedReply !== null) {
    await sendWhatsappTextMessage(user.whatsapp_number, cachedReply);
    return;
  }

  const existingAccount = await getAccountForUser(userId);
  let account = existingAccount;
  if (!account) {
    const inviteCode = caption ? INVITE_CODE_MESSAGE_PATTERN.exec(caption)?.[1] : undefined;
    account = (inviteCode ? await redeemAccountInvite(inviteCode, userId) : null) ?? (await createAccountForUser(userId));
  }

  const { buffer, mimeType } = await downloadWhatsappMedia(mediaRef);
  const document = await uploadDocument({
    accountId: account.accountId,
    uploadedByUserId: userId,
    fileName,
    mimeType,
    caption,
    buffer,
  });

  const reply = await readAndRespond({ user, document, buffer, mimeType, fileName, caption });
  await setCachedReply(waMessageId, reply);
  await sendWhatsappTextMessage(user.whatsapp_number, reply);
}

interface ReadAndRespondInput {
  user: User;
  document: Document;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  caption?: string;
}

async function readAndRespond({ user, document, buffer, mimeType, fileName, caption }: ReadAndRespondInput): Promise<string> {
  const savedReply = MESSAGES.documentReceived(fileName);

  const kind = getAnalyzableKind(mimeType, buffer.length);
  if (!kind) return savedReply;

  let conversationText: string;
  try {
    const extraction = await extractDocumentContent({ buffer, mimeType, kind, caption });
    if (!extraction) return savedReply;

    const extractedText = buildExtractedText(extraction);
    await saveDocumentAnalysis(document.id, {
      extractedText,
      extractedData: toStoredExtraction(extraction),
      embedding: await embedText(buildDocumentEmbeddingText({ fileName, caption, extractedText })),
    });
    conversationText = formatExtractionForConversation({ fileName, caption, extraction });
  } catch (error) {
    logger.error('document_read_failed', { documentId: document.id, error: error instanceof Error ? error.message : String(error) });
    return savedReply;
  }

  // Quem ainda não terminou o onboarding segue no fluxo de cadastro: o
  // arquivo fica lido e buscável, mas a conversa não é desviada pra ele.
  if (!user.onboarding_completed_at) return savedReply;

  try {
    const { replyText } = await orchestrateTurn({ user, messageText: conversationText, messageSource: 'text' });
    return breakLinesAfterSentences(replyText);
  } catch (error) {
    logger.error('document_reply_failed', { documentId: document.id, error: error instanceof Error ? error.message : String(error) });
    return savedReply;
  }
}
