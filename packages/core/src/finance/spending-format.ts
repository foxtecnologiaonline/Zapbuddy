import { formatBrl } from '../calc/format.js';

const CATEGORY_LABELS: Record<string, string> = {
  alimentacao: 'alimentação',
  transporte: 'transporte',
  moradia: 'moradia',
  saude: 'saúde',
  lazer: 'lazer',
  fornecedores: 'fornecedores',
  impostos: 'impostos',
  educacao: 'educação',
  outros: 'outros',
  venda: 'venda',
  servico_prestado: 'serviço prestado',
  salario: 'salário',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export interface SpendingSummaryInput {
  periodLabel: string;
  totalExpenseCents: number;
  totalIncomeCents: number;
  byCategory: Record<string, number>;
  count: number;
}

/** Resumo financeiro curto pro atalho "gastos": só números que vieram do banco. */
export function formatSpendingSummary(summary: SpendingSummaryInput): string {
  if (summary.count === 0) return `Não tenho nenhum lançamento ${summary.periodLabel}.\nÉ só me contar, tipo "gastei 50 no mercado", que eu registro.`;

  const top = Object.entries(summary.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, cents]) => `• ${categoryLabel(category)}: ${formatBrl(cents)}`);

  const lines = [`📊 *Seu resumo ${summary.periodLabel}*`, `Gastos: ${formatBrl(summary.totalExpenseCents)}`];
  if (summary.totalIncomeCents > 0) lines.push(`Receitas: ${formatBrl(summary.totalIncomeCents)}`);
  if (top.length > 0) lines.push('Onde mais pesou:', ...top);
  return lines.join('\n');
}
