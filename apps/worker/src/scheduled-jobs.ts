import { getProactiveResearchQueue, getInterpretationFeedbackQueue, getLogsRetentionQueue } from '@zapbuddy/core';

/**
 * Registra os jobs recorrentes via `repeat` do BullMQ — seguro de chamar em
 * todo boot do worker: o BullMQ deduplica job repetível pela combinação
 * nome/padrão/jobId, então isso nunca cria agendamento duplicado. Só faz
 * sentido aqui porque apps/worker roda como processo persistente numa VPS
 * (ver deploy/worker/README.md), não serverless — um `repeat` registrado
 * numa função Vercel não sobreviveria entre invocações.
 */
export async function scheduleRecurringJobs(): Promise<void> {
  await getProactiveResearchQueue().add(
    'run',
    {},
    { repeat: { pattern: '0 9 * * 1' }, jobId: 'proactive-research-weekly' },
  );

  await getInterpretationFeedbackQueue().add(
    'run',
    {},
    { repeat: { pattern: '0 10 * * 1' }, jobId: 'interpretation-feedback-weekly' },
  );

  // Horário distinto dos outros dois jobs semanais (9h/10h) de propósito —
  // evita os três competindo por conexão com o Supabase ao mesmo tempo.
  await getLogsRetentionQueue().add('run', {}, { repeat: { pattern: '0 11 * * 1' }, jobId: 'logs-retention-weekly' });
}
