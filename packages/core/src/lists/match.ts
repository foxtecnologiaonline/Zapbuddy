/**
 * Casamento de item de lista por texto, sem LLM: "ovos" acha "ovos caipiras",
 * "ovo" acha "ovos" (plural simples), sem acento nem caixa. Resolve cada
 * pedido de marcar/remover em um item, vários (ambíguo) ou nenhum — quem
 * decide o que fazer com ambiguidade é a tool, que devolve as opções.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Plural simples: "ovos" -> "ovo", "limoes" -> "limoe"; palavras curtas ficam como estão.
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
    .join(' ');
}

export interface MatchableItem {
  id: string;
  text: string;
}

export type ItemMatch<T extends MatchableItem> =
  | { kind: 'one'; item: T }
  | { kind: 'ambiguous'; candidates: T[] }
  | { kind: 'none' };

export function matchItem<T extends MatchableItem>(items: T[], query: string): ItemMatch<T> {
  const needle = normalizeText(query);
  if (needle === '') return { kind: 'none' };

  const exact = items.filter((item) => normalizeText(item.text) === needle);
  if (exact.length === 1) return { kind: 'one', item: exact[0]! };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };

  const partial = items.filter((item) => {
    const hay = normalizeText(item.text);
    return hay.includes(needle) || needle.includes(hay);
  });
  if (partial.length === 1) return { kind: 'one', item: partial[0]! };
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial };
  return { kind: 'none' };
}

/** Texto do item pra salvar: tira espaços e primeira letra minúscula/maiúscula mantida como a pessoa escreveu. */
export function cleanItemText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}
