import type { Job } from 'bullmq';
import { findUserById } from '@zapbuddy/db';
import {
  orchestrateTurn,
  sendWhatsappTextMessage,
  downloadWhatsappAudio,
  type AudioTranscriptionJob,
} from '@zapbuddy/core';
import { getAudioTranscriber } from '../audio/get-transcriber.js';

export async function handleAudioTranscription(job: Job<AudioTranscriptionJob>): Promise<void> {
  const { userId, audioRef } = job.data;

  const user = await findUserById(userId);
  if (!user) {
    // eslint-disable-next-line no-console
    console.error('audio-transcription: user not found', { userId });
    return;
  }

  try {
    const { buffer, mimeType } = await downloadWhatsappAudio(audioRef);
    const transcript = await getAudioTranscriber().transcribe(buffer, mimeType);

    const { replyText } = await orchestrateTurn({
      user,
      messageText: transcript,
      messageSource: 'audio',
    });

    await sendWhatsappTextMessage(user.whatsapp_number, replyText);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('audio-transcription failed', { userId, error });
    await sendWhatsappTextMessage(
      user.whatsapp_number,
      'Não consegui processar seu áudio agora. Pode escrever em texto por enquanto?',
    );
  }
}
