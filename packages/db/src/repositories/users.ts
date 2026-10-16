import { getSupabaseClient } from '../client.js';
import type { User } from '../types.js';

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
