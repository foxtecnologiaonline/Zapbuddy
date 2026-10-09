import { Queue, type DefaultJobOptions } from 'bullmq';
import { getRedisConnection } from '../redis.js';
import type { AudioRef } from '../whatsapp/types.js';

/**
 * Sem isso, uma falha transitória (rate limit da Claude, timeout de rede no
 * WhatsApp/Whisper) derrubava o job pra 'failed' sem nenhuma nova tentativa
 * — o usuário simplesmente nunca recebia resposta, silenciosamente. 3
 * tentativas com backoff exponencial (5s, 10s, 20s) cobre a maioria dos
 * blips sem virar um martelo que reenvia a mesma falha permanente várias
 * vezes seguidas.
 */
const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
};

export const QUEUE_NAMES = {
  audioTranscription: 'audio-transcription',
  incomingMessage: 'incoming-message',
  reminderDispatch: 'reminder-dispatch',
} as const;

export interface AudioTranscriptionJob {
  userId: string;
  whatsappNumber: string;
  /** Opaco por provider — só o canal que emitiu a mensagem sabe interpretar. */
  audioRef: AudioRef;
  waMessageId: string;
}

export interface IncomingMessageJob {
  userId: string;
  whatsappNumber: string;
  text: string;
  waMessageId: string;
}

export interface ReminderDispatchJob {
  reminderId: string;
}

let audioQueue: Queue<AudioTranscriptionJob> | null = null;
let messageQueue: Queue<IncomingMessageJob> | null = null;
let reminderQueue: Queue<ReminderDispatchJob> | null = null;

export function getAudioTranscriptionQueue(): Queue<AudioTranscriptionJob> {
  audioQueue ??= new Queue(QUEUE_NAMES.audioTranscription, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return audioQueue;
}

export function getIncomingMessageQueue(): Queue<IncomingMessageJob> {
  messageQueue ??= new Queue(QUEUE_NAMES.incomingMessage, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return messageQueue;
}

export function getReminderDispatchQueue(): Queue<ReminderDispatchJob> {
  reminderQueue ??= new Queue(QUEUE_NAMES.reminderDispatch, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return reminderQueue;
}
