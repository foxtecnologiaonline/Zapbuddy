import { getSupabaseClient } from '../client.js';
import type { Contact } from '../types.js';

/** Teto de leitura: agenda pessoal de um assistente de WhatsApp — a busca por nome roda em memória sobre isto. */
const CONTACTS_LIMIT = 300;

/** Cria o contato ou, se esse número já existe na conta, atualiza o nome (a pessoa corrigindo "Aline" → "Aline Souza"). */
export async function upsertContact(
  accountId: string,
  userId: string,
  input: { name: string; nameNormalized: string; whatsappNumber: string },
): Promise<Contact> {
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .upsert(
      {
        account_id: accountId,
        created_by_user_id: userId,
        name: input.name,
        name_normalized: input.nameNormalized,
        whatsapp_number: input.whatsappNumber,
      },
      { onConflict: 'account_id,whatsapp_number' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as Contact;
}

export async function listContacts(accountId: string): Promise<Contact[]> {
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .order('name_normalized', { ascending: true })
    .limit(CONTACTS_LIMIT);

  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function deleteContact(accountId: string, contactId: string): Promise<Contact | null> {
  const { data, error } = await getSupabaseClient()
    .from('contacts')
    .delete()
    .eq('id', contactId)
    .eq('account_id', accountId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Contact | null) ?? null;
}
