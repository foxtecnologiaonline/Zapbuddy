import { getSupabaseClient } from '../client.js';
import type { CalendarConnection } from '../types.js';

export interface SaveCalendarConnectionInput {
  accountId: string;
  /** Já criptografado pelo caller (packages/core/src/security/crypto.ts) — esta camada nunca vê o token em claro. */
  refreshTokenEncrypted: string;
  calendarId?: string;
  connectedByUserId: string;
}

/** Upsert por account_id: reconectar (ex.: revogou e autorizou de novo) substitui a conexão anterior. */
export async function saveCalendarConnection(input: SaveCalendarConnectionInput): Promise<CalendarConnection> {
  const { data, error } = await getSupabaseClient()
    .from('calendar_connections')
    .upsert(
      {
        account_id: input.accountId,
        google_refresh_token_encrypted: input.refreshTokenEncrypted,
        google_calendar_id: input.calendarId ?? 'primary',
        connected_by_user_id: input.connectedByUserId,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as CalendarConnection;
}

export async function getCalendarConnection(accountId: string): Promise<CalendarConnection | null> {
  const { data, error } = await getSupabaseClient()
    .from('calendar_connections')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw error;
  return data as CalendarConnection | null;
}
