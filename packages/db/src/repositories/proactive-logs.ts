import { getSupabaseClient } from '../client.js';

/**
 * Trava de idempotência das mensagens proativas: o INSERT é a trava — a unique
 * (account_id, kind, ref) deixa só UM chamador ganhar. Devolve true se ESTE
 * chamador reservou o envio (pode mandar), false se já existia. Reservar antes
 * de enviar troca "pode perder um aviso se o envio falhar" por "nunca manda
 * duas vezes", que é o lado certo pra mensagem que ninguém pediu na hora.
 */
export async function claimProactiveMessage(accountId: string, kind: string, ref: string): Promise<boolean> {
  const { error } = await getSupabaseClient().from('proactive_message_logs').insert({ account_id: accountId, kind, ref });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

export async function countProactiveMessagesSince(accountId: string, kind: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('proactive_message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('kind', kind)
    .gte('sent_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/** Refs já usados de um tipo (ex.: dicas já mandadas) — pra nunca repetir. */
export async function listProactiveRefs(accountId: string, kind: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient().from('proactive_message_logs').select('ref').eq('account_id', accountId).eq('kind', kind).limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<{ ref: string }>).map((row) => row.ref);
}
