import { supabase } from '../lib/supabase';

const UNIQUE_VIOLATION = '23505';

/**
 * Marca o messageId como processado de forma atômica (insert direto, sem
 * select prévio — 1 round-trip, sem janela de corrida). Retorna true na
 * primeira vez que esse messageId é visto; false se já tinha sido
 * processado (reenvio de webhook da Meta) — o chamador deve pular.
 */
export async function markMessageProcessedOnce(messageId: string): Promise<boolean> {
  const { error } = await supabase.from('processed_messages').insert({ message_id: messageId });

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw error;
}
