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
