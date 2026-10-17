import { randomInt } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import type { Account, AccountRole } from '../types.js';

export interface UserAccount {
  accountId: string;
  role: AccountRole;
}

/** Null se o usuário ainda não tem conta (ex.: primeira mensagem antes de resolver onboarding/convite). */
export async function getAccountForUser(userId: string): Promise<UserAccount | null> {
  const { data, error } = await getSupabaseClient()
    .from('account_members')
    .select('account_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { accountId: data.account_id as string, role: data.role as AccountRole };
}

/** Cria uma conta nova com o usuário como owner — caminho padrão pra quem não veio de convite. */
export async function createAccountForUser(userId: string): Promise<UserAccount> {
  const { data: account, error: accountError } = await getSupabaseClient()
    .from('accounts')
    .insert({})
    .select('*')
    .single();
  if (accountError) throw accountError;

  const { error: memberError } = await getSupabaseClient()
    .from('account_members')
    .insert({ account_id: (account as Account).id, user_id: userId, role: 'owner' });
  if (memberError) throw memberError;

  return { accountId: (account as Account).id, role: 'owner' };
}

const INVITE_TTL_MINUTES = 15;

function generateInviteCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export interface CreatedInvite {
  code: string;
  expiresInMinutes: number;
}

/** Só quem já é owner da conta deve chegar a chamar isso — checado em tools/account.ts via ctx.role. */
export async function createAccountInvite(accountId: string, createdByUserId: string): Promise<CreatedInvite> {
  const expiresAt = new Date(Date.now() + INVITE_TTL_MINUTES * 60 * 1000).toISOString();

  // Colisão de código de 6 dígitos é rara (1/1M) mas não impossível — algumas
  // tentativas com código novo em vez de deixar a tool falhar por um unique
  // violation que o usuário não tem como entender.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateInviteCode();
    const { error } = await getSupabaseClient().from('account_invites').insert({
      account_id: accountId,
      code,
      created_by_user_id: createdByUserId,
      expires_at: expiresAt,
    });
    if (!error) return { code, expiresInMinutes: INVITE_TTL_MINUTES };
    if (error.code !== '23505') throw error; // não é unique violation — erro real, propaga
  }
  throw new Error('Não foi possível gerar um código de convite único após várias tentativas');
}

/** Válido, não expirado, não usado -> entra na conta como member e marca o convite consumido. Retorna null se inválido. */
export async function redeemAccountInvite(code: string, userId: string): Promise<UserAccount | null> {
  const client = getSupabaseClient();

  const { data: invite, error: findError } = await client
    .from('account_invites')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (findError) throw findError;
  if (!invite) return null;
  if (invite.used_at) return null;
  if (new Date(invite.expires_at as string).getTime() < Date.now()) return null;

  const { error: memberError } = await client
    .from('account_members')
    .insert({ account_id: invite.account_id, user_id: userId, role: 'member' });
  if (memberError) throw memberError;

  const { error: consumeError } = await client
    .from('account_invites')
    .update({ used_at: new Date().toISOString(), used_by_user_id: userId })
    .eq('id', invite.id as string);
  if (consumeError) throw consumeError;

  return { accountId: invite.account_id as string, role: 'member' };
}

export interface AccountMemberSummary {
  userId: string;
  name: string | null;
  role: AccountRole;
}

export async function listAccountMembers(accountId: string): Promise<AccountMemberSummary[]> {
  const { data, error } = await getSupabaseClient()
    .from('account_members')
    .select('role, users(id, name)')
    .eq('account_id', accountId);

  if (error) throw error;
  return (data ?? []).map((row) => {
    const user = row.users as unknown as { id: string; name: string | null };
    return { userId: user.id, name: user.name, role: row.role as AccountRole };
  });
}
