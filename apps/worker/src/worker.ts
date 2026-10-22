import { Worker, type Job } from 'bullmq';
import { getRedisConnection, QUEUE_NAMES, sendWhatsappTextMessage, MESSAGES, getInsightsSweepQueue, writeWorkerHeartbeat } from '@zapbuddy/core';
import { logError, markReminderFailed, logger } from '@zapbuddy/db';
import { handleIncomingMessage } from './handlers/incoming-message.js';
import { handleAudioTranscription } from './handlers/audio-transcription.js';
import { handleReminderDispatch } from './handlers/reminder-dispatch.js';
import { handleDocumentUpload } from './handlers/document-upload.js';
import { handleInsightsSweep } from './handlers/insights-sweep.js';
import { handleInsightsGenerate } from './handlers/insights-generate.js';
import { handleWebhookDispatch } from './handlers/webhook-dispatch.js';
import { handleWeeklyDigestGenerate } from './handlers/weekly-digest-generate.js';
import { handleMorningDigestGenerate } from './handlers/morning-digest-generate.js';
import { handleImportantDateReminder } from './handlers/important-date-reminder.js';

const connection = getRedisConnection();

// Job repetível (1x/hora) registrado no boot do worker — BullMQ dedupa pelo
// jobId interno do repeat, então reiniciar o worker (deploy, crash) não cria
// um segundo agendamento. Único lugar que "liga" o sweep de insights
// proativos (ADR 0003, decisão 2); sem isso rodando em algum processo, a
// fila existe mas nunca dispara sozinha.
void getInsightsSweepQueue()
  .add('sweep', {}, { repeat: { pattern: '0 * * * *' }, jobId: 'hourly-insights-sweep' })
  .catch((error) => logger.error('insights_sweep_schedule_failed', { error: error instanceof Error ? error.message : String(error) }));

function isExhausted(job: Job): boolean {
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

/**
 * Avisa o usuário SÓ quando o job esgotou todas as tentativas (ver
 * DEFAULT_JOB_OPTIONS em queues/definitions.ts) — nunca a cada retry
 * intermediário, senão a pessoa recebe "não consegui processar" várias
 * vezes seguidas enquanto o BullMQ ainda está tentando de novo por trás.
 */
async function notifyUserOfExhaustedJob(whatsappNumber: string): Promise<void> {
  try {
    await sendWhatsappTextMessage(whatsappNumber, MESSAGES.genericProcessingError);
  } catch (notifyError) {
    logger.error('exhausted_job_notify_failed', { whatsappNumber, notifyError });
  }
}

/**
 * Uma fila por tipo de job, de propósito (não unificadas num Worker só):
 * concorrência e comportamento de falha esgotada são diferentes por fila —
 * áudio é CPU/IO-bound e mais lento (concurrency menor), e só
 * reminder-dispatch não notifica o usuário no esgotamento (ver comentário
 * abaixo). O que esta tabela unifica é a construção/registro repetidos,
 * não as filas em si.
 */
// BullMQ checa job "travado" a cada `stalledInterval` (default 30s) POR
// Worker, pra sempre, mesmo sem nenhum job ativo — com 11 filas isso sozinho
// já gerava ~60 mil comandos/Redis em 2 dias (foi a causa real de estourar o
// limite do plano Fixed da Upstash em menos de 48h, ver investigação
// 2026-10: nada a ver com volume de mensagem real, é overhead de infra
// ocioso). 1h em todas as filas, inclusive incoming-message/
// audio-transcription — decisão explícita do dono do produto: aceita que,
// no caso raro de o worker cair bem no meio de processar uma mensagem real,
// o usuário pode ficar sem resposta por até 1h (em vez de até 30s) até o
// BullMQ perceber e reprocessar, em troca de ~96% menos comando de Redis
// (ver análise de custo 2026-10). Isso não afeta a velocidade normal de
// processamento (orientado a evento, não polling) — só o tempo de
// recuperação depois de um crash.
const STALLED_INTERVAL_MS = 60 * 60_000;

// Segundo achado da mesma análise de consumo (2026-10): mesmo com
// stalledInterval alto, todo Worker reemite BZPOPMIN a cada `drainDelay`
// (default do BullMQ: 5s) enquanto a fila está vazia SEM job atrasado
// pendente. Subido pra 1h (pedido explícito do dono do produto, 2026-10) —
// não atrasa pickup de job real: um job novo acorda o Worker na hora via a
// chave "marker" que o BullMQ empurra em todo Queue.add() (ver
// addJobInTargetList.lua), independente do valor de drainDelay — isso só
// governa a cadência de "nada aconteceu, tenta de novo".
//
// IMPORTANTE — isso NÃO cobre reminder-dispatch/insights-sweep: enquanto
// existe QUALQUER job atrasado/repetível pendente nessas filas (o caso
// comum — sempre que alguém tem lembrete futuro marcado, ou pro sweep
// horário em si, que por definição sempre tem a próxima ocorrência
// pendente), o próprio BullMQ IGNORA drainDelay e usa um teto fixo de 10s,
// hardcoded na própria lib (node_modules/bullmq/dist/esm/classes/worker.js,
// `const maximumBlockTimeout = 10`, dentro de getBlockTimeout — motivo
// documentado lá: "restrict the maximum block timeout to 10 second to
// avoid blocking the connection for too long in the case of
// reconnections", referenciando taskforcesh/bullmq#1658). Não é uma opção
// de configuração — não existe campo em WorkerOptions pra isso. Patchar a
// lib de terceiro pra ignorar isso (frágil, quebra a cada `npm update
// bullmq`) reintroduziria o próprio risco que a BullMQ documentou: um
// Worker bloqueado até 1h esperando um bzpopmin que nunca volta, porque a
// conexão caiu e ele não percebeu — o mesmo "Tom não responde" que motivou
// essa investigação, só que pior. Decisão explícita do dono do produto
// (2026-10): manter essas duas como estão (lembrete precisa disparar na
// hora exata; o sweep não tem como evitar ter sempre uma próxima
// ocorrência pendente) — `onboarding-nudge` foi a única das três
// candidatas convertida pra varredura horária (ver
// handlers/onboarding-nudge.ts), por não ter a mesma exigência de
// precisão.
const DRAIN_DELAY_SECONDS = 60 * 60;

const QUEUE_CONFIGS: {
  name: string;
  handler: (job: Job) => Promise<void>;
  concurrency: number;
  onExhausted?: (job: Job, error: Error) => Promise<void>;
}[] = [
  {
    name: QUEUE_NAMES.incomingMessage,
    handler: handleIncomingMessage,
    concurrency: 5,
    onExhausted: (job) => notifyUserOfExhaustedJob(job.data.whatsappNumber),
  },
  {
    name: QUEUE_NAMES.audioTranscription,
    handler: handleAudioTranscription,
    concurrency: 3,
    onExhausted: (job) => notifyUserOfExhaustedJob(job.data.whatsappNumber),
  },
  {
    name: QUEUE_NAMES.reminderDispatch,
    handler: handleReminderDispatch,
    concurrency: 5,
    // Sem notificação de fallback ao usuário aqui: se o próprio envio ao
    // WhatsApp é o que está falhando (ex.: fora da janela de 24h da Cloud
    // API, que exige template aprovado pra mensagem livre nesse caso —
    // limitação da Meta, não corrigível em código), mandar "deu erro" teria
    // o mesmo problema. Só marca 'failed' no banco quando esgota as
    // tentativas, pra não ficar preso em 'pending' pra sempre e indistinguível
    // de um lembrete que ainda vai disparar.
    onExhausted: async (job, error) => {
      const reminderId = job.data.reminderId as string;
      await markReminderFailed(reminderId, error.message).catch((dbError) => {
        logger.error('mark_reminder_failed_error', { reminderId, dbError });
      });
    },
  },
  {
    name: QUEUE_NAMES.documentUpload,
    handler: handleDocumentUpload,
    concurrency: 3,
    onExhausted: (job) => notifyUserOfExhaustedJob(job.data.whatsappNumber),
  },
  {
    // Sem onExhausted: ninguém está esperando resposta em tempo real (mesmo
    // raciocínio do reminder-dispatch) — uma falha esgotada só fica no log
    // genérico de erro acima, não precisa de tratamento especial.
    name: QUEUE_NAMES.insightsSweep,
    handler: handleInsightsSweep,
    concurrency: 1,
  },
  {
    name: QUEUE_NAMES.insightsGenerate,
    handler: handleInsightsGenerate,
    concurrency: 5,
  },
  {
    name: QUEUE_NAMES.webhookDispatch,
    handler: handleWebhookDispatch,
    concurrency: 5,
  },
  {
    name: QUEUE_NAMES.weeklyDigestGenerate,
    handler: handleWeeklyDigestGenerate,
    concurrency: 5,
  },
  {
    // Sem onExhausted: resumo é opcional por natureza — falha esgotada só vai pro log.
    name: QUEUE_NAMES.morningDigestGenerate,
    handler: handleMorningDigestGenerate,
    concurrency: 5,
  },
  {
    // Sem onExhausted: mesmo raciocínio do weeklyDigestGenerate — ninguém espera essa mensagem num momento exato.
    name: QUEUE_NAMES.importantDateReminder,
    handler: handleImportantDateReminder,
    concurrency: 5,
  },
];

const workers = QUEUE_CONFIGS.map(({ name, handler, concurrency, onExhausted }) => {
  const worker = new Worker(name, handler, {
    connection,
    concurrency,
    stalledInterval: STALLED_INTERVAL_MS,
    drainDelay: DRAIN_DELAY_SECONDS,
  });
  worker.on('failed', (job, error) => {
    logger.error('job_failed', { queue: name, jobId: job?.id, error: error.message, attemptsMade: job?.attemptsMade });
    if (!job || !isExhausted(job)) return;

    // Só loga no admin quando esgota as tentativas — um retry intermediário
    // ainda pode se recuperar sozinho (ver DEFAULT_JOB_OPTIONS), e logar cada
    // tentativa intermediária inflaria o card "Erros" com ruído transitório.
    void logError({
      source: 'worker',
      message: error.message,
      detail: { queue: name, jobId: job.id, data: job.data },
      userId: (job.data as { userId?: string }).userId ?? null,
    });
    if (onExhausted) void onExhausted(job, error);
  });
  return worker;
});

logger.info('worker_started', { queues: workers.map((w) => w.name) });

// Sinal de vida pro card de status do admin — sem isso não há como distinguir
// "worker rodando mas ocioso" de "worker caiu" a partir do processo da web (que
// não compartilha memória/processo com o worker, só o Redis entre os dois).
// 2h (não 30s): ninguém precisa saber que o worker caiu em tempo real — é
// um indicador de admin, não um alerta de produção — e o comando de Redis
// repetido pra sempre é puro overhead (mesmo raciocínio do
// STALLED_INTERVAL_MS acima, parte da causa real do estouro de limite da
// Upstash em 2026-10). WORKER_HEARTBEAT_STALE_MS em redis.ts mantém a
// mesma folga de 3x.
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 60_000;
void writeWorkerHeartbeat();
const heartbeatInterval = setInterval(() => void writeWorkerHeartbeat(), HEARTBEAT_INTERVAL_MS);

async function shutdown(): Promise<void> {
  clearInterval(heartbeatInterval);
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
