import type { Job } from 'bullmq';
import { findUserById } from '@zapbuddy/db';
import {
  orchestrateTurn,
  sendWhatsappTextMessage,
  downloadWhatsappAudio,
  getCachedReply,
  setCachedReply,
  type AudioTranscriptionJob,
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
    // eslint-disable-next-line no-console
    console.error('audio-transcription: user not found', { userId });
    return;
  }

  // Idempotência: se a transcrição+orquestração já rodou numa tentativa
  // anterior (e só o envio falhou), reusa a resposta em vez de transcrever
  // e rodar a IA de novo — evita custo duplicado e duplicar tool calls.
  let replyText = await getCachedReply(waMessageId);
  if (replyText === null) {
    try {
      const { buffer, mimeType } = await downloadWhatsappAudio(audioRef);
      const transcript = await getAudioTranscriber().transcribe(buffer, mimeType);

      const result = await orchestrateTurn({ user, messageText: transcript, messageSource: 'audio' });
      replyText = result.replyText;
      await setCachedReply(waMessageId, replyText);
    } catch (error) {
      if (error instanceof AudioTooLongError) {
        // Erro permanente — repetir não muda o resultado. Avisa direto e
        // não deixa propagar, pra não gastar as 3 tentativas do BullMQ
        // numa falha que nunca vai ter sucesso.
        await sendWhatsappTextMessage(
          user.whatsapp_number,
          'Esse áudio é muito longo pra eu processar. Pode mandar um mais curto ou escrever em texto?',
        );
        return;
      }
      throw error;
    }
  }

  await sendWhatsappTextMessage(user.whatsapp_number, replyText);
}
