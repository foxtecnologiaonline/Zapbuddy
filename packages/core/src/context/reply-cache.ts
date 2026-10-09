import { getRedisConnection } from '../redis.js';

const TTL_SECONDS = 60 * 60 * 24; // cobre folgadamente a janela de qualquer retry do BullMQ

function key(waMessageId: string): string {
  return `reply-cache:${waMessageId}`;
}

/**
 * Idempotência por mensagem do WhatsApp. Sem isso, habilitar retry nas
 * filas (ver queues/definitions.ts) seria perigoso: se o envio ao WhatsApp
 * falhar DEPOIS da IA já ter chamado record_transaction/create_task, um
 * retry ingênuo re-rodaria orchestrateTurn do zero — a IA veria a mesma
 * mensagem de novo e poderia chamar a tool de novo, duplicando o efeito
 * (ex.: o mesmo gasto registrado duas vezes). Os handlers checam este cache
 * antes de orquestrar; se já existe uma resposta gerada pra este
 * waMessageId, só reenviam — nunca rodam a IA/tools de novo pra ele.
 */
export async function getCachedReply(waMessageId: string): Promise<string | null> {
  return getRedisConnection().get(key(waMessageId));
}

export async function setCachedReply(waMessageId: string, replyText: string): Promise<void> {
  await getRedisConnection().set(key(waMessageId), replyText, 'EX', TTL_SECONDS);
}

function reminderDispatchedKey(reminderId: string): string {
  return `reminder-dispatched:${reminderId}`;
}

/**
 * Mesmo problema do cache acima, versão lembrete: com retry habilitado
 * (DEFAULT_JOB_OPTIONS), se sendWhatsappTextMessage tiver sucesso mas o
 * markReminderSent() seguinte falhar (ex.: blip de rede no Supabase), o
 * status no banco continua 'pending' e um retry ingênuo manda a mesma
 * notificação de novo pro usuário. O handler marca isto como despachado
 * LOGO APÓS o envio ter sucesso (nunca antes) e checa antes de reenviar.
 */
export async function hasReminderBeenDispatched(reminderId: string): Promise<boolean> {
  return (await getRedisConnection().get(reminderDispatchedKey(reminderId))) !== null;
}

export async function markReminderDispatched(reminderId: string): Promise<void> {
  await getRedisConnection().set(reminderDispatchedKey(reminderId), '1', 'EX', TTL_SECONDS);
}
