/** Categorias sugeridas para despesas — a IA deve preferir uma destas; "outros" é o fallback. */
export const EXPENSE_CATEGORIES = [
  'alimentacao',
  'transporte',
  'moradia',
  'saude',
  'lazer',
  'fornecedores',
  'impostos',
  'educacao',
  'outros',
] as const;

export const INCOME_CATEGORIES = ['venda', 'servico_prestado', 'salario', 'outros'] as const;

const ALL_CATEGORIES = new Set<string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);

/**
 * Normaliza uma categoria vinda do modelo: aceita qualquer string (o modelo
 * pode "inventar" uma variação de grafia ou algo fora da lista), mas nunca
 * deixa a tool falhar por categoria desconhecida — cai em 'outros'. Isso
 * evita que um erro de validação apareça como falha técnica numa conversa
 * que deveria soar natural (ver system-prompt.ts).
 */
export function normalizeCategory(raw: string): string {
  // Remove acentos antes de comparar: todas as categorias canônicas já são
  // sem acento ('saude', 'educacao'...), mas é natural a IA escrever
  // "saúde"/"educação" — sem isso, essas variações ortográficas comuns
  // caiam em 'outros' por engano, justamente o cenário que esta função
  // existe pra evitar.
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return ALL_CATEGORIES.has(normalized) ? normalized : 'outros';
}
