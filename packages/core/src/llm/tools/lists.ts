import { z } from 'zod';
import {
  addListItems,
  clearDoneListItems,
  deleteList,
  findListByName,
  getOrCreateList,
  listAccountLists,
  listItemsOfList,
  listPendingItemCounts,
  removeListItems,
  setListItemsDone,
  type UserList,
} from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { cleanItemText, matchItem, normalizeText } from '../../lists/match.js';

const MAX_ITEMS_PER_LIST = 200;

async function resolveList(accountId: string, name: string | undefined): Promise<{ list: UserList } | { error: Record<string, unknown> }> {
  const all = await listAccountLists(accountId);
  if (name && name.trim()) {
    const found = await findListByName(accountId, name);
    return found ? { list: found } : { error: { found: false, reason: 'list_not_found', lists: all.map((list) => list.name) } };
  }
  if (all.length === 1) return { list: all[0]! };
  return { error: { found: false, reason: all.length === 0 ? 'no_lists' : 'list_name_required', lists: all.map((list) => list.name) } };
}

export const manageListTool = defineTool({
  name: 'manage_list',
  description:
    'Listas (compras, viagem...). action: add (list+items; cria a lista), show, check/uncheck (items pego/feito), remove, clear_done, delete (só se ela pediu), show_all. Itens casam por texto; ambiguous → pergunte qual. Sem list e com uma lista só, vale ela.',
  schema: z.object({
    action: z.enum(['add', 'show', 'check', 'uncheck', 'remove', 'clear_done', 'delete', 'show_all']),
    list: z.string().max(60).optional(),
    items: z.array(z.string().min(1).max(120)).max(30).optional(),
  }),
  execute: async (params, ctx) => {
    const { action } = params;

    if (action === 'show_all') {
      const [lists, counts] = await Promise.all([listAccountLists(ctx.accountId), listPendingItemCounts(ctx.accountId)]);
      return { lists: lists.map((list) => ({ name: list.name, pending: counts[list.id]?.pending ?? 0, done: counts[list.id]?.done ?? 0 })) };
    }

    if (action === 'add') {
      const texts = (params.items ?? []).map(cleanItemText).filter(Boolean);
      if (texts.length === 0) return { added: false, reason: 'items_required' };

      let list: UserList;
      if (params.list && params.list.trim()) {
        list = await getOrCreateList(ctx.accountId, params.list);
      } else {
        const resolved = await resolveList(ctx.accountId, undefined);
        if ('error' in resolved) return { added: false, ...resolved.error };
        list = resolved.list;
      }

      const existing = await listItemsOfList(list.id);
      if (existing.length + texts.length > MAX_ITEMS_PER_LIST) return { added: false, reason: 'list_full', max_items: MAX_ITEMS_PER_LIST };

      const pendingKeys = new Set(existing.filter((item) => !item.done).map((item) => normalizeText(item.text)));
      const fresh: string[] = [];
      const duplicates: string[] = [];
      for (const text of texts) {
        const key = normalizeText(text);
        if (pendingKeys.has(key)) duplicates.push(text);
        else {
          pendingKeys.add(key);
          fresh.push(text);
        }
      }
      const created = fresh.length > 0 ? await addListItems(list.id, ctx.accountId, fresh) : [];
      const pendingCount = existing.filter((item) => !item.done).length + created.length;
      return { added: created.length > 0, list: list.name, items_added: created.map((item) => item.text), already_on_list: duplicates, pending_count: pendingCount };
    }

    const resolved = await resolveList(ctx.accountId, params.list);
    if ('error' in resolved) return resolved.error;
    const list = resolved.list;

    if (action === 'show') {
      const items = await listItemsOfList(list.id);
      return { found: true, list: list.name, items: items.map((item) => ({ text: item.text, done: item.done })) };
    }

    if (action === 'delete') {
      const deleted = await deleteList(ctx.accountId, list.id);
      return { deleted: Boolean(deleted), list: list.name };
    }

    if (action === 'clear_done') {
      return { cleared: await clearDoneListItems(ctx.accountId, list.id), list: list.name };
    }

    // check / uncheck / remove: resolve cada pedido em um item da lista.
    const queries = (params.items ?? []).map(cleanItemText).filter(Boolean);
    if (queries.length === 0) return { updated: false, reason: 'items_required' };

    const items = await listItemsOfList(list.id);
    const pool = action === 'check' ? items.filter((item) => !item.done) : action === 'uncheck' ? items.filter((item) => item.done) : items;

    const matchedIds = new Set<string>();
    const matchedTexts: string[] = [];
    const ambiguous: Array<{ query: string; options: string[] }> = [];
    const notFound: string[] = [];
    for (const query of queries) {
      const match = matchItem(pool, query);
      if (match.kind === 'one') {
        if (!matchedIds.has(match.item.id)) {
          matchedIds.add(match.item.id);
          matchedTexts.push(match.item.text);
        }
      } else if (match.kind === 'ambiguous') {
        ambiguous.push({ query, options: match.candidates.map((candidate) => candidate.text) });
      } else {
        notFound.push(query);
      }
    }

    const ids = [...matchedIds];
    if (ids.length > 0) {
      if (action === 'remove') await removeListItems(ctx.accountId, ids);
      else await setListItemsDone(ctx.accountId, ids, action === 'check');
    }
    const pendingBefore = items.filter((item) => !item.done).length;
    const pendingRemoved = items.filter((item) => !item.done && matchedIds.has(item.id)).length;
    const remainingPending = action === 'uncheck' ? pendingBefore + ids.length : pendingBefore - pendingRemoved;
    return { updated: ids.length > 0, list: list.name, affected: matchedTexts, ambiguous, not_found: notFound, pending_count: remainingPending };
  },
});
