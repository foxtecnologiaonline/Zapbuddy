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
 *
 * `removeOnComplete`/`removeOnFail`: sem isso o BullMQ mantém todo job
 * concluído/falhado no Redis pra sempre (comportamento default) — com 11
 * filas, várias periódicas, isso cresce sem limite e foi a causa raiz real
 * de um banco Upstash (plano Fixed) estourar o limite e travar até o `AUTH`
 * (indisponibilidade total, nem webhook enfileira nem worker processa).
 * Job concluído não tem valor de debug (o rastro real já fica em
 * `tool_call_logs`/`error_logs` no Postgres, via `logToolCall`/`logError` —
 * ver CLAUDE.md), então pode ser podado agressivo; falho vale manter um
 * pouco mais pra inspeção manual via BullMQ antes de reprocessar.
 */
const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 200, age: 24 * 3600 },
  removeOnFail: { count: 500, age: 7 * 24 * 3600 },
};

// proactive-research/interpretation-feedback/logs-retention/onboarding-nudge
// não têm fila própria (2026-10, análise de consumo de Redis — ver
// CLAUDE.md): as 3 primeiras eram filas `repeat` rodando 1x/semana;
// onboarding-nudge era delay nativo do BullMQ por usuário (2h/24h). Em
// qualquer um dos dois casos, a fila com job atrasado/repetível pendente
// fica presa 24/7 no teto de 10s de bloqueio do BullMQ — desperdício
// grande pra algo que roda raramente por fila (1x/semana) ou que não
// precisa de precisão ao minuto (reengajamento de onboarding). As quatro
// agora rodam direto dentro do sweep horário já existente
// (apps/worker/src/handlers/insights-sweep.ts), gated por dia/hora UTC ou
// por janela de horas desde o cadastro. reminder-dispatch continua com
// delay nativo do BullMQ — lembrete precisa disparar na hora exata que a
// pessoa marcou, decisão explícita do dono do produto de manter a
// precisão em troca do teto de 10s nessa fila.
export const QUEUE_NAMES = {
  audioTranscription: 'audio-transcription',
  incomingMessage: 'incoming-message',
  reminderDispatch: 'reminder-dispatch',
  documentUpload: 'document-upload',
  insightsSweep: 'insights-sweep',
  insightsGenerate: 'insights-generate',
  webhookDispatch: 'webhook-dispatch',
  weeklyDigestGenerate: 'weekly-digest-generate',
  morningDigestGenerate: 'morning-digest-generate',
  importantDateReminder: 'important-date-reminder',
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

export interface WeeklyDigestGenerateJob {
  accountId: string;
  ownerWhatsappNumber: string;
  ownerTimezone: string;
}

export interface MorningDigestGenerateJob {
  accountId: string;
  ownerWhatsappNumber: string;
  ownerTimezone: string;
  /** Saudação com nome (preferred_name ou primeiro nome); ausente = sem nome. */
  displayName?: string | null;
  /** Cidade informada pela pessoa (set_city); ausente = aproximação pelo DDD. */
  city?: { uf: string; latitude: number; longitude: number } | null;
  /** Hora local em que o sweep disparou o resumo — define bom dia/boa tarde/boa noite. */
  digestHour?: number;
  includeAgenda?: boolean;
  includeFinance?: boolean;
}

export type OnboardingNudgeStage = '2h' | '24h';

/**
 * Enfileirado pelo sweep horário (insights-sweep.ts) quando detecta que o
 * dia de hoje, no fuso da conta, bate com o month/day de uma important_date
 * — mesmo padrão de insights-generate/weekly-digest-generate (sweep decide
 * QUEM, este job só manda e loga).
 */
export interface ImportantDateReminderJob {
  importantDateId: string;
  label: string;
  ownerWhatsappNumber: string;
  year: number;
}

let audioQueue: Queue<AudioTranscriptionJob> | null = null;
let messageQueue: Queue<IncomingMessageJob> | null = null;
let reminderQueue: Queue<ReminderDispatchJob> | null = null;
let documentQueue: Queue<DocumentUploadJob> | null = null;
let insightsSweepQueue: Queue<InsightsSweepJob> | null = null;
let insightsGenerateQueue: Queue<InsightsGenerateJob> | null = null;
let webhookDispatchQueue: Queue<WebhookDispatchJob> | null = null;
let weeklyDigestGenerateQueue: Queue<WeeklyDigestGenerateJob> | null = null;
let morningDigestGenerateQueue: Queue<MorningDigestGenerateJob> | null = null;
let importantDateReminderQueue: Queue<ImportantDateReminderJob> | null = null;

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

export function getWeeklyDigestGenerateQueue(): Queue<WeeklyDigestGenerateJob> {
  weeklyDigestGenerateQueue ??= new Queue(QUEUE_NAMES.weeklyDigestGenerate, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return weeklyDigestGenerateQueue;
}

export function getMorningDigestGenerateQueue(): Queue<MorningDigestGenerateJob> {
  morningDigestGenerateQueue ??= new Queue(QUEUE_NAMES.morningDigestGenerate, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return morningDigestGenerateQueue;
}

export function getImportantDateReminderQueue(): Queue<ImportantDateReminderJob> {
  importantDateReminderQueue ??= new Queue(QUEUE_NAMES.importantDateReminder, {
    connection: getRedisConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  return importantDateReminderQueue;
}
