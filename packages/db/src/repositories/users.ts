import { getSupabaseClient } from '../client.js';
import type { PlanStatus, User } from '../types.js';

// Números reais (com DDI+DDD) ficam nessa faixa de dígitos; um payload
// malformado (ex.: webhook com JID de grupo mal filtrado, ou um provider
// devolvendo string vazia) não deve virar um registro de usuário no banco.
const WHATSAPP_NUMBER_PATTERN = /^\d{10,15}$/;

export class InvalidWhatsappNumberError extends Error {
  constructor(whatsappNumber: string) {
    super(`Número de WhatsApp inválido: "${whatsappNumber}"`);
    this.name = 'InvalidWhatsappNumberError';
  }
}

export async function findUserByWhatsappNumber(whatsappNumber: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('*')
    .eq('whatsapp_number', whatsappNumber)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function findUserById(userId: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function createUser(whatsappNumber: string): Promise<User> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .insert({ whatsapp_number: whatsappNumber })
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

/**
 * Ponto único de entrada de número de WhatsApp pro banco — valida antes de
 * ler ou criar, pra nenhum caller (webhook oficial, webhook Evolution, ou
 * futuro) precisar lembrar de validar por conta própria.
 */
export async function getOrCreateUser(whatsappNumber: string): Promise<User> {
  if (!WHATSAPP_NUMBER_PATTERN.test(whatsappNumber)) {
    throw new InvalidWhatsappNumberError(whatsappNumber);
  }
  const existing = await findUserByWhatsappNumber(whatsappNumber);
  if (existing) return existing;
  return createUser(whatsappNumber);
}

export async function completeOnboarding(userId: string, name: string): Promise<User> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .update({ name, onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

export async function countUsers(): Promise<number> {
  const { count, error } = await getSupabaseClient().from('users').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function countUsersSince(sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('users')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sinceIso);

  if (error) throw error;
  return count ?? 0;
}

/** Contagem de contatos por status de assinatura, pra o card "Assinaturas" do admin. */
export async function countUsersByPlanStatus(): Promise<Record<PlanStatus, number>> {
  const { data, error } = await getSupabaseClient().from('users').select('plan_status');
  if (error) throw error;

  const counts: Record<PlanStatus, number> = { trial: 0, active: 0, canceled: 0 };
  for (const row of data ?? []) {
    const status = (row as { plan_status: PlanStatus }).plan_status;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

const CONTACTS_PAGE_SIZE = 25;

export interface ListUsersResult {
  users: User[];
  total: number;
}

/** Lista paginada de contatos pro admin, com busca opcional por número/nome. */
export async function listUsers(page: number, search?: string): Promise<ListUsersResult> {
  const from = page * CONTACTS_PAGE_SIZE;
  const to = from + CONTACTS_PAGE_SIZE - 1;

  let query = getSupabaseClient()
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    const term = search.replace(/[%,()]/g, '');
    query = query.or(`whatsapp_number.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { users: (data ?? []) as User[], total: count ?? 0 };
}

export async function updateUserPlanStatus(userId: string, status: PlanStatus): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('users')
    .update({ plan_status: status, plan_status_updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

export const USERS_PAGE_SIZE = CONTACTS_PAGE_SIZE;
