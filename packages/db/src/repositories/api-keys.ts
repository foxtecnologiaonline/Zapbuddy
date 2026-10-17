import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import type { ApiKey } from '../types.js';

const KEY_PREFIX = 'zb_live_';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export interface CreatedApiKey {
  id: string;
  rawKey: string;
}

/** `rawKey` só existe neste retorno — nunca persistido, nunca recuperável depois (mesmo padrão de magic-links.ts). */
export async function createApiKey(accountId: string, name: string): Promise<CreatedApiKey> {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

  const { data, error } = await getSupabaseClient()
    .from('api_keys')
    .insert({ account_id: accountId, name, key_hash: hashKey(rawKey) })
    .select('id')
    .single();

  if (error) throw error;
  return { id: (data as { id: string }).id, rawKey };
}

/** Retorna o account_id se a chave for válida e não revogada; atualiza last_used_at best-effort. Null se inválida. */
export async function findAccountIdByApiKey(rawKey: string): Promise<string | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('api_keys')
    .select('id, account_id, revoked_at')
    .eq('key_hash', hashKey(rawKey))
    .maybeSingle();

  if (error) throw error;
  if (!data || data.revoked_at) return null;

  // Best-effort: uma falha aqui não deve derrubar a requisição autenticada.
  void (async () => {
    try {
      await client.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id as string);
    } catch {
      // ignorado de propósito — ver comentário acima
    }
  })();

  return data.account_id as string;
}

export async function listApiKeys(accountId: string): Promise<ApiKey[]> {
  const { data, error } = await getSupabaseClient()
    .from('api_keys')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ApiKey[];
}

export async function revokeApiKey(accountId: string, keyId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('account_id', accountId);

  if (error) throw error;
}
