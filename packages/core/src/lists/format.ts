import type { UserList, UserListItem } from '@zapbuddy/db';

/**
 * Lista pronta pra WhatsApp: pendentes primeiro (⬜), feitos depois (✅) — um
 * emoji por linha. Vazia diz isso claramente em vez de mandar só o título.
 */
export function formatListText(list: Pick<UserList, 'name'>, items: Array<Pick<UserListItem, 'text' | 'done'>>): string {
  const title = `*${list.name}*`;
  if (items.length === 0) return `${title}\nEstá vazia por enquanto.`;

  const pending = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done);
  const lines = [title, ...pending.map((item) => `⬜ ${item.text}`), ...done.map((item) => `✅ ${item.text}`)];
  const footer = pending.length === 0 ? 'Tudo marcado!' : `Falta${pending.length === 1 ? '' : 'm'} ${pending.length} de ${items.length}.`;
  return `${lines.join('\n')}\n${footer}`;
}

export function formatListsOverview(lists: Array<{ name: string; pending: number; done: number }>): string {
  if (lists.length === 0) return 'Você ainda não tem nenhuma lista.\nÉ só falar, tipo: "põe leite e pão na lista de compras".';
  const lines = lists.map((list) => {
    const total = list.pending + list.done;
    const detail = total === 0 ? 'vazia' : list.pending === 0 ? 'tudo marcado' : `${list.pending} pendente${list.pending === 1 ? '' : 's'}`;
    return `• ${list.name}: ${detail}`;
  });
  return `*Suas listas*\n${lines.join('\n')}\nPra ver uma, manda "lista de" e o nome.`;
}
