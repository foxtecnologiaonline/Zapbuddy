import { getSupabaseClient } from '../client.js';
import type { CalendarConnection, CalendarProvider } from '../types.js';

export interface SaveCalendarConnectionInput {
  accountId: string;
  provider: CalendarProvider;
  /** Já criptografado pelo caller (packages/core/src/security/crypto.ts) — esta camada nunca vê o token em claro. */
  refreshTokenEncrypted: string;
  calendarId?: string;
  connectedByUserId: string;
}

/**
 * Upsert por account_id: reconectar substitui a conexão anterior — seja
 * reautorizar o MESMO provider, seja trocar pro outro (ex.: tinha Google
 * conectado, conecta o Outlook) — uma conta tem um calendário conectado por
 * vez, decisão explícita do dono do produto (2026-10, ver CLAUDE.md).
 */
export async function saveCalendarConnection(input: SaveCalendarConnectionInput): Promise<CalendarConnection> {
  const { data, error } = await getSupabaseClient()
    .from('calendar_connections')
    .upsert(
      {
        account_id: input.accountId,
        provider: input.provider,
        refresh_token_encrypted: input.refreshTokenEncrypted,
        calendar_id: input.calendarId ?? 'primary',
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

/**
 * Troca o refresh token guardado por um novo (o Outlook devolve um token NOVO a cada renovação, e o antigo expira ~90
 * dias depois da emissão: sem gravar o novo, a conexão morre sozinha). Condicional ao token anterior: duas renovações
 * simultâneas não se atropelam (a que perder a corrida atualiza 0 linhas). Devolve se gravou.
 */
export async function rotateCalendarRefreshToken(accountId: string, previousEncrypted: string, nextEncrypted: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('calendar_connections')
    .update({ refresh_token_encrypted: nextEncrypted })
    .eq('account_id', accountId)
    .eq('refresh_token_encrypted', previousEncrypted)
    .select('account_id');

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Remove a conexão (refresh token revogado ou expirado: não adianta guardar um token morto, só repetiria a falha todo dia). */
export async function deleteCalendarConnection(accountId: string): Promise<void> {
  const { error } = await getSupabaseClient().from('calendar_connections').delete().eq('account_id', accountId);
  if (error) throw error;
}
