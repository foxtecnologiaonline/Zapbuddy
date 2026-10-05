import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import type { MagicLink } from '../types.js';

const TOKEN_TTL_MINUTES = 15;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token — this is what goes in the WhatsApp message URL, never store it raw. */
export async function createMagicLink(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await getSupabaseClient().from('magic_links').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });

  if (error) throw error;
  return token;
}

/**
 * Checks validity without consuming — used to render a confirmation page
 * before the token is spent, since WhatsApp/chat clients prefetch links to
 * build a preview and would otherwise burn the token via a plain GET.
 */
export async function isMagicLinkValid(token: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('magic_links')
    .select('used_at, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;
  if (data.used_at) return false;
  return new Date(data.expires_at).getTime() >= Date.now();
}

/** Consumes the token if valid; returns the user_id, or null if invalid/expired/already used. */
export async function consumeMagicLink(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('magic_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw error;
  const link = data as MagicLink | null;
  if (!link) return null;
  if (link.used_at) return null;
  if (new Date(link.expires_at).getTime() < Date.now()) return null;

  const { error: updateError } = await client
    .from('magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('id', link.id);

  if (updateError) throw updateError;
  return link.user_id;
}
