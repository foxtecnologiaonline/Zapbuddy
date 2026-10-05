import { getSupabaseClient } from '../client.js';
import type { User } from '../types.js';

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

export async function getOrCreateUser(whatsappNumber: string): Promise<User> {
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
