import { supabase } from '../lib/supabase';
import type { Client } from '../types/client';

interface ClientRow {
  id: string;
  whatsapp_id: string;
  name: string | null;
  status: Client['status'];
  onboarding_step: Client['onboardingStep'];
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ClientRow): Client {
  return {
    id: row.id,
    whatsappId: row.whatsapp_id,
    name: row.name,
    status: row.status,
    onboardingStep: row.onboarding_step,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findClientByWhatsAppId(whatsappId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp_id', whatsappId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as ClientRow) : null;
}

const UNIQUE_VIOLATION = '23505';

export async function createClient(whatsappId: string): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ whatsapp_id: whatsappId, status: 'onboarding' })
    .select('*')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Outra requisição concorrente (ex: reenvio de webhook da Meta) já criou
      // o registro entre o find e este insert.
      const existing = await findClientByWhatsAppId(whatsappId);
      if (existing) return existing;
    }
    throw error;
  }

  return mapRow(data as ClientRow);
}

export async function setOnboardingStep(
  clientId: string,
  step: NonNullable<Client['onboardingStep']>,
): Promise<void> {
  const { error } = await supabase.from('clients').update({ onboarding_step: step }).eq('id', clientId);

  if (error) throw error;
}

export async function markOnboardingComplete(clientId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({
      status: 'active',
      name,
      onboarding_step: null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', clientId);

  if (error) throw error;
}
