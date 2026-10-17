import { Queue, type DefaultJobOptions } from 'bullmq';
import { getRedisConnection } from '../redis.js';
import type { MediaRef } from '../whatsapp/types.js';
import type { WebhookEventTypePublic } from '@zapbuddy/db';

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
  documentUpload: 'document-upload',
  insightsSweep: 'insights-sweep',
  insightsGenerate: 'insights-generate',
  webhookDispatch: 'webhook-dispatch',
  proactiveResearch: 'proactive-research',
  interpretationFeedback: 'interpretation-feedback',
} as const;

export interface AudioTranscriptionJob {
  userId: string;
  whatsappNumber: string;
  /** Opaco por provider — só o canal que emitiu a mensagem sabe interpretar. */
  audioRef: MediaRef;
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

export interface DocumentUploadJob {
  userId: string;
  whatsappNumber: string;
  mediaRef: MediaRef;
  fileName: string;
  caption?: string;
  waMessageId: string;
}

/** Job único, sem payload — o handler faz a varredura inteira (ver ADR 0003, decisão 2). */
export type InsightsSweepJob = Record<string, never>;

export interface InsightsGenerateJob {
  accountId: string;
  ownerWhatsappNumber: string;
  ownerTimezone: string;
}

export interface WebhookDispatchJob {
  accountId: string;
  eventType: WebhookEventTypePublic;
  payload: Record<string, unknown>;
}

// Jobs sem payload — cada handler decide seu próprio escopo (lista fixa de
// tópicos, período fixo de 7 dias — ver apps/worker/src/handlers/). Existem
// só pra caber no mesmo formato Queue<T>/Worker das outras filas.
export type ProactiveResearchJob = Record<string, never>;
export type InterpretationFeedbackJob = Record<string, never>;

let audioQueue: Queue<AudioTranscriptionJob> | null = null;
let messageQueue: Queue<IncomingMessageJob> | null = null;
let reminderQueue: Queue<ReminderDispatchJob> | null = null;
let documentQueue: Queue<DocumentUploadJob> | null = null;
let insightsSweepQueue: Queue<InsightsSweepJob> | null = null;
let insightsGenerateQueue: Queue<InsightsGenerateJob> | null = null;
let webhookDispatchQueue: Queue<WebhookDispatchJob> | null = null;
let proactiveResearchQueue: Queue<ProactiveResearchJob> | null = null;
let interpretationFeedbackQueue: Queue<InterpretationFeedbackJob> | null = null;

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

export function getDocumentUploadQueue(): Queue<DocumentUploadJob> {
  documentQueue ??= new Queue(QUEUE_NAMES.documentUpload, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return documentQueue;
}

export function getInsightsSweepQueue(): Queue<InsightsSweepJob> {
  insightsSweepQueue ??= new Queue(QUEUE_NAMES.insightsSweep, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return insightsSweepQueue;
}

export function getInsightsGenerateQueue(): Queue<InsightsGenerateJob> {
  insightsGenerateQueue ??= new Queue(QUEUE_NAMES.insightsGenerate, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return insightsGenerateQueue;
}

export function getWebhookDispatchQueue(): Queue<WebhookDispatchJob> {
  webhookDispatchQueue ??= new Queue(QUEUE_NAMES.webhookDispatch, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return webhookDispatchQueue;
}

export function getProactiveResearchQueue(): Queue<ProactiveResearchJob> {
  proactiveResearchQueue ??= new Queue(QUEUE_NAMES.proactiveResearch, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return proactiveResearchQueue;
}

export function getInterpretationFeedbackQueue(): Queue<InterpretationFeedbackJob> {
  interpretationFeedbackQueue ??= new Queue(QUEUE_NAMES.interpretationFeedback, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return interpretationFeedbackQueue;
}
