import type { Job } from 'bullmq';
import { findUserById, logger } from '@zapbuddy/db';
import {
  orchestrateTurn,
  sendWhatsappTextMessage,
  sendWhatsappTyping,
  deliverReply,
  encodeReply,
  decodeReply,
  downloadWhatsappMedia,
  isAccessBlocked,
  getCachedReply,
  setCachedReply,
  MESSAGES,
  type AudioTranscriptionJob,
  type ReplyEnvelope,
} from '@zapbuddy/core';
import { getAudioTranscriber } from '../audio/get-transcriber.js';
import { AudioTooLongError } from '../audio/whisper-transcriber.js';

/**
 * Sem try/catch amplo de propósito: deixar o erro propagar é o que permite
 * o retry do BullMQ (ver DEFAULT_JOB_OPTIONS em queues/definitions.ts). O
 * aviso amigável "não consegui processar seu áudio" só deve ir pro usuário
 * depois que TODAS as tentativas esgotarem — isso é tratado no listener
 * 'failed' do worker (ver worker.ts), não aqui.
 */
export async function handleAudioTranscription(job: Job<AudioTranscriptionJob>): Promise<void> {
  const { userId, audioRef, waMessageId } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    logger.error('audio_transcription_user_not_found', { userId, waMessageId });
    return;
  }

  // Bloqueado (trial encerrado/cancelado): nem baixa nem transcreve — áudio
  // é o caminho mais caro (Whisper) e o bloqueio só aceita CPF/CNPJ em texto.
  if (isAccessBlocked(user)) {
    await sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.trialBlocked);
    return;
  }

  // Idempotência: se a transcrição+orquestração já rodou numa tentativa
  // anterior (e só o envio falhou), reusa a resposta em vez de transcrever
  // e rodar a IA de novo — evita custo duplicado e duplicar tool calls.
  let reply: ReplyEnvelope;
  let afterSend: (() => Promise<void>) | undefined;
  const cached = await getCachedReply(waMessageId);
  if (cached !== null) {
    reply = decodeReply(cached);
  } else {
    try {
      const { buffer, mimeType } = await downloadWhatsappMedia(audioRef);
      const transcript = await getAudioTranscriber().transcribe(buffer, mimeType);

      void sendWhatsappTyping(user.whatsapp_number, waMessageId);
      const result = await orchestrateTurn({ user, messageText: transcript, messageSource: 'audio' });
      reply = { text: result.replyText, reaction: result.reaction };
      afterSend = result.afterSend;
      await setCachedReply(waMessageId, encodeReply(reply));
    } catch (error) {
      if (error instanceof AudioTooLongError) {
        // Erro permanente — repetir não muda o resultado. Avisa direto e
        // não deixa propagar, pra não gastar as 3 tentativas do BullMQ
        // numa falha que nunca vai ter sucesso.
        await sendWhatsappTextMessage(user.whatsapp_number, MESSAGES.audioTooLong);
        return;
      }
      throw error;
    }
  }

  await deliverReply({ to: user.whatsapp_number, waMessageId, reply });

  if (afterSend) {
    await afterSend().catch((error) => {
      logger.warn('after_send_failed', { userId, error: error instanceof Error ? error.message : String(error) });
    });
  }
}
