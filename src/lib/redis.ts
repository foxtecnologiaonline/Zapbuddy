import IORedis from 'ioredis';

let client: IORedis | undefined;

// Conexão única e compartilhada (rate limit + fila BullMQ reaproveitam esta
// mesma instância, em vez de abrir uma conexão Redis cada).
export function getRedis(): IORedis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL é obrigatório');
    // maxRetriesPerRequest: null é exigido pelo BullMQ nessa conexão.
    client = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return client;
}
