/**
 * Limpeza manual, pontual, de jobs concluídos/falhados acumulados no Redis
 * antes do fix de `removeOnComplete`/`removeOnFail` em
 * `src/queues/definitions.ts` — sem isso o BullMQ reteve todo job pra
 * sempre, o que estourou o limite do plano Fixed da Upstash e derrubou
 * webhook+worker (nem AUTH passava). Roda via `Queue.clean()` (API correta
 * do BullMQ, não deleta chave Redis manualmente) — nunca mexe em jobs
 * `waiting`/`active`/`delayed`, só `completed`/`failed`, pra não perder
 * mensagem de usuário ainda na fila.
 *
 * Uso: REDIS_URL=... npm run clean-queues --workspace=@zapbuddy/core
 */
import { Queue } from 'bullmq';
import { getRedisConnection } from '../src/redis.js';
import { QUEUE_NAMES } from '../src/queues/definitions.js';

const GRACE_MS = 0; // sem período de graça: já sabemos que é lixo acumulado de semanas
const BATCH_LIMIT = 10_000; // bem acima do volume esperado de um MVP, numa única passada

async function cleanQueue(name: string): Promise<void> {
  const queue = new Queue(name, { connection: getRedisConnection() });
  const completedRemoved = await queue.clean(GRACE_MS, BATCH_LIMIT, 'completed');
  const failedRemoved = await queue.clean(GRACE_MS, BATCH_LIMIT, 'failed');
  console.log(`${name}: ${completedRemoved.length} completed + ${failedRemoved.length} failed removidos`);
  await queue.close();
}

async function main(): Promise<void> {
  for (const name of Object.values(QUEUE_NAMES)) {
    await cleanQueue(name);
  }
  await getRedisConnection().quit();
  console.log('Limpeza concluída.');
}

main().catch((error) => {
  console.error('clean-queues falhou:', error);
  process.exit(1);
});
