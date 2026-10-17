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

const COMBINING_DIACRITICS_REGEX = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

/**
 * Remove acentos antes de comparar: todas as categorias canônicas já são
 * sem acento ('saude', 'educacao'...), mas é natural a IA escrever
 * "saúde"/"educação" — sem isso, essas variações ortográficas comuns
 * cairiam em 'outros' por engano, justamente o cenário que esta função
 * existe pra evitar.
 */
function normalize(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFD').replace(COMBINING_DIACRITICS_REGEX, '');
}

/**
 * Indica se a categoria crua (como o modelo mandou) bate com uma categoria
 * canônica, sem aplicar o fallback — usado só pra registrar no log se
 * normalizeCategory() precisou cair em 'outros' (ver tools/finance.ts).
 */
export function isRecognizedCategory(raw: string): boolean {
  return ALL_CATEGORIES.has(normalize(raw));
}

/**
 * Normaliza uma categoria vinda do modelo: aceita qualquer string (o modelo
 * pode "inventar" uma variação de grafia ou algo fora da lista), mas nunca
 * deixa a tool falhar por categoria desconhecida — cai em 'outros'. Isso
 * evita que um erro de validação apareça como falha técnica numa conversa
 * que deveria soar natural (ver system-prompt.ts).
 */
export function normalizeCategory(raw: string): string {
  const normalized = normalize(raw);
  return ALL_CATEGORIES.has(normalized) ? normalized : 'outros';
}
