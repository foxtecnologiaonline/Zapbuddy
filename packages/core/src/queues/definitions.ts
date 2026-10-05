import { Queue } from 'bullmq';
import { getRedisConnection } from '../redis.js';

export const QUEUE_NAMES = {
  audioTranscription: 'audio-transcription',
  incomingMessage: 'incoming-message',
  reminderDispatch: 'reminder-dispatch',
} as const;

export interface AudioTranscriptionJob {
  userId: string;
  whatsappNumber: string;
  mediaId: string;
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
  audioQueue ??= new Queue(QUEUE_NAMES.audioTranscription, { connection: getRedisConnection() });
  return audioQueue;
}

export function getIncomingMessageQueue(): Queue<IncomingMessageJob> {
  messageQueue ??= new Queue(QUEUE_NAMES.incomingMessage, { connection: getRedisConnection() });
  return messageQueue;
}

export function getReminderDispatchQueue(): Queue<ReminderDispatchJob> {
  reminderQueue ??= new Queue(QUEUE_NAMES.reminderDispatch, { connection: getRedisConnection() });
  return reminderQueue;
}
