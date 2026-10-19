import { randomInt, randomBytes } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import type { Account, AccountRole } from '../types.js';

export interface UserAccount {
  accountId: string;
  role: AccountRole;
}

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I — evita confusão falada/digitada
const REFERRAL_CODE_LENGTH = 6;

function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[bytes[i]! % REFERRAL_CODE_ALPHABET.length];
  }
  return code;
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

const REFERRAL_CODE_MAX_ATTEMPTS = 5;

/** Cria uma conta nova com o usuário como owner — caminho padrão pra quem não veio de convite. */
export async function createAccountForUser(userId: string): Promise<UserAccount> {
  const client = getSupabaseClient();
  let account: Account | null = null;

  // Colisão de 6 chars num alfabeto de 32 símbolos é rara mas não impossível —
  // mesma lógica de retry do código de convite acima, aplicada aqui porque
  // referral_code tem UNIQUE constraint (migration 0009).
  for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS && !account; attempt++) {
    const { data, error } = await client
      .from('accounts')
      .insert({ referral_code: generateReferralCode() })
      .select('*')
      .single();
    if (!error) {
      account = data as Account;
      break;
    }
    if (error.code !== '23505') throw error;
  }
  if (!account) throw new Error('Não foi possível gerar um código de indicação único após várias tentativas');

  const { error: memberError } = await client
    .from('account_members')
    .insert({ account_id: account.id, user_id: userId, role: 'owner' });
  if (memberError) throw memberError;

  return { accountId: account.id, role: 'owner' };
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

/**
 * Válido, não expirado, não usado -> entra na conta como member e marca o
 * convite consumido. Retorna null se inválido.
 *
 * O "claim" do convite é a própria UPDATE condicional abaixo (`used_at is
 * null`), não um SELECT seguido de UPDATE separado — duas mensagens batendo
 * o mesmo código quase ao mesmo tempo (ex.: código vazou ou foi encaminhado
 * sem querer) não podiam mais ser ambas aceitas: só a UPDATE que realmente
 * mudar a linha (retornando-a) é quem "ganha" o convite; a segunda chamada
 * vê 0 linhas afetadas e trata como convite já usado/inválido.
 */
export async function redeemAccountInvite(code: string, userId: string): Promise<UserAccount | null> {
  const client = getSupabaseClient();

  const { data: invite, error: claimError } = await client
    .from('account_invites')
    .update({ used_at: new Date().toISOString(), used_by_user_id: userId })
    .eq('code', code)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!invite) return null;

  const { error: memberError } = await client
    .from('account_members')
    .insert({ account_id: invite.account_id, user_id: userId, role: 'member' });
  if (memberError) throw memberError;

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

export interface AccountOwnerForSweep {
  accountId: string;
  ownerUserId: string;
  ownerWhatsappNumber: string;
  ownerTimezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
}

/**
 * Lista todas as contas com o número/fuso do dono — usado pelo sweep horário
 * de insights proativos (ADR 0003, decisão 2) pra calcular a hora local de
 * cada conta sem uma query por conta. Só o dono entra (não todos os
 * membros — decisão 4 do ADR).
 */
export async function listAccountsForInsightsSweep(): Promise<AccountOwnerForSweep[]> {
  const { data, error } = await getSupabaseClient()
    .from('account_members')
    .select('account_id, users(id, whatsapp_number, timezone, quiet_hours_start, quiet_hours_end)')
    .eq('role', 'owner');

  if (error) throw error;
  return (data ?? []).map((row) => {
    const user = row.users as unknown as {
      id: string;
      whatsapp_number: string;
      timezone: string;
      quiet_hours_start: number;
      quiet_hours_end: number;
    };
    return {
      accountId: row.account_id as string,
      ownerUserId: user.id,
      ownerWhatsappNumber: user.whatsapp_number,
      ownerTimezone: user.timezone,
      quietHoursStart: user.quiet_hours_start,
      quietHoursEnd: user.quiet_hours_end,
    };
  });
}

export async function findAccountByReferralCode(code: string): Promise<Account | null> {
  const { data, error } = await getSupabaseClient().from('accounts').select('*').eq('referral_code', code).maybeSingle();
  if (error) throw error;
  return data as Account | null;
}

/**
 * Registra a indicação (não bloqueia criação de conta — ver decisão 3 do ADR
 * 0003). `referred_account_id` é UNIQUE (migration 0009): uma conta só pode
 * ter sido indicada uma vez, então um erro de unique violation aqui é
 * silenciosamente ignorado, não propagado — não deveria acontecer na prática
 * (só é chamado na criação da própria conta), mas não é motivo pra falhar o
 * cadastro do usuário se acontecer.
 */
export async function recordReferral(referrerAccountId: string, referredAccountId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('referrals')
    .insert({ referrer_account_id: referrerAccountId, referred_account_id: referredAccountId });
  if (error && error.code !== '23505') throw error;
}

export interface ReferralStats {
  code: string;
  totalReferred: number;
}

export async function getReferralStats(accountId: string): Promise<ReferralStats> {
  const client = getSupabaseClient();
  const [{ data: account, error: accountError }, { count, error: countError }] = await Promise.all([
    client.from('accounts').select('referral_code').eq('id', accountId).single(),
    client.from('referrals').select('*', { count: 'exact', head: true }).eq('referrer_account_id', accountId),
  ]);

  if (accountError) throw accountError;
  if (countError) throw countError;

  return { code: (account as { referral_code: string }).referral_code, totalReferred: count ?? 0 };
}
