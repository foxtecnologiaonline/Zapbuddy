import { getSupabaseClient } from '../client.js';
import type { UserList, UserListItem } from '../types.js';

/** Nome da lista sem acento/caixa/espaço sobrando — é a chave de unicidade por conta (migration 0028). */
export function listNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function findListByName(accountId: string, name: string): Promise<UserList | null> {
  const { data, error } = await getSupabaseClient()
    .from('lists')
    .select('*')
    .eq('account_id', accountId)
    .eq('name_key', listNameKey(name))
    .maybeSingle();
  if (error) throw error;
  return (data as UserList | null) ?? null;
}

/** Acha a lista pelo nome ou cria — a unique (account_id, name_key) resolve corrida entre duas mensagens. */
export async function getOrCreateList(accountId: string, name: string): Promise<UserList> {
  const existing = await findListByName(accountId, name);
  if (existing) return existing;

  const { data, error } = await getSupabaseClient()
    .from('lists')
    .insert({ account_id: accountId, name: name.trim(), name_key: listNameKey(name) })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const raced = await findListByName(accountId, name);
      if (raced) return raced;
    }
    throw error;
  }
  return data as UserList;
}

export async function listAccountLists(accountId: string): Promise<UserList[]> {
  const { data, error } = await getSupabaseClient().from('lists').select('*').eq('account_id', accountId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserList[];
}

export async function listItemsOfList(listId: string): Promise<UserListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('list_items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as UserListItem[];
}

/** Itens de várias listas de uma vez (visão geral "minhas listas"), só os pendentes contam no resumo. */
export async function listPendingItemCounts(accountId: string): Promise<Record<string, { pending: number; done: number }>> {
  const { data, error } = await getSupabaseClient().from('list_items').select('list_id, done').eq('account_id', accountId).limit(5000);
  if (error) throw error;
  const counts: Record<string, { pending: number; done: number }> = {};
  for (const row of (data ?? []) as Array<{ list_id: string; done: boolean }>) {
    const bucket = (counts[row.list_id] ??= { pending: 0, done: 0 });
    if (row.done) bucket.done += 1;
    else bucket.pending += 1;
  }
  return counts;
}

export async function addListItems(listId: string, accountId: string, texts: string[]): Promise<UserListItem[]> {
  if (texts.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('list_items')
    .insert(texts.map((text) => ({ list_id: listId, account_id: accountId, text })))
    .select('*');
  if (error) throw error;
  return (data ?? []) as UserListItem[];
}

export async function setListItemsDone(accountId: string, itemIds: string[], done: boolean): Promise<UserListItem[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('list_items')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('account_id', accountId)
    .in('id', itemIds)
    .select('*');
  if (error) throw error;
  return (data ?? []) as UserListItem[];
}

export async function removeListItems(accountId: string, itemIds: string[]): Promise<UserListItem[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await getSupabaseClient().from('list_items').delete().eq('account_id', accountId).in('id', itemIds).select('*');
  if (error) throw error;
  return (data ?? []) as UserListItem[];
}

export async function clearDoneListItems(accountId: string, listId: string): Promise<number> {
  const { data, error } = await getSupabaseClient()
    .from('list_items')
    .delete()
    .eq('account_id', accountId)
    .eq('list_id', listId)
    .eq('done', true)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function deleteList(accountId: string, listId: string): Promise<UserList | null> {
  const { data, error } = await getSupabaseClient().from('lists').delete().eq('account_id', accountId).eq('id', listId).select('*').maybeSingle();
  if (error) throw error;
  return (data as UserList | null) ?? null;
}
