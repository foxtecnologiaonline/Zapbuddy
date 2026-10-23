/** Minúsculo, sem acento, espaços colapsados — "Aliné  Souza" e "aline souza" são o mesmo nome. */
export function normalizeContactName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NamedContact {
  name_normalized: string;
}

export type ContactMatch<T> = { kind: 'none' } | { kind: 'one'; contact: T } | { kind: 'ambiguous'; contacts: T[] };

/**
 * Resolve "a Aline" contra a agenda. Do mais ao menos específico, parando no
 * primeiro nível que achar alguém: nome exato → começa com o termo → alguma
 * palavra do nome começa com o termo → contém o termo. Mais de um no mesmo
 * nível é ambíguo — o Tom pergunta qual, nunca escolhe por conta própria
 * (mandar pra pessoa errada não tem volta).
 */
export function matchContactByName<T extends NamedContact>(query: string, contacts: T[]): ContactMatch<T> {
  const q = normalizeContactName(query);
  if (!q) return { kind: 'none' };

  const tiers: Array<(contact: T) => boolean> = [
    (contact) => contact.name_normalized === q,
    (contact) => contact.name_normalized.startsWith(q),
    (contact) => contact.name_normalized.split(' ').some((word) => word.startsWith(q)),
    (contact) => contact.name_normalized.includes(q),
  ];

  for (const tier of tiers) {
    const hits = contacts.filter(tier);
    if (hits.length === 1) return { kind: 'one', contact: hits[0]! };
    if (hits.length > 1) return { kind: 'ambiguous', contacts: hits };
  }
  return { kind: 'none' };
}
