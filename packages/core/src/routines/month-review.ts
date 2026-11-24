import { formatBrl } from '../calc/format.js';
import { percentChange } from '../calc/finance.js';
import { categoryLabel } from '../finance/spending-format.js';

/**
 * Revisão do mês (comando "revisão do mês"): formatador PURO, sem LLM e sem dado inventado. Só entra linha de algo que foi
 * lido de verdade; uma fonte que falhou some em vez de virar "zero" (que seria mentira).
 */

export interface MonthReviewData {
  name: string | null;
  /** 'current' = este mês até ontem; 'previous' = o mês passado inteiro (revisão feita no dia 1, quando o atual ainda está vazio). */
  period: 'current' | 'previous';
  /** "novembro" — já no fuso da pessoa. */
  monthLabel: string;
  expenseCents: number;
  incomeCents: number;
  /** Gasto do mesmo trecho do mês anterior; null quando não há base de comparação. */
  compareExpenseCents: number | null;
  topCategories: Array<{ category: string; cents: number }>;
  /** null = não deu pra ler (a linha some). */
  completedTasks: number | null;
  habitCheckins: number | null;
  billsCount: number;
  billsTotalCents: number;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function formatMonthReview(data: MonthReviewData): string {
  const who = data.name ? `, ${data.name}` : '';
  const head = data.period === 'previous' ? `🗓️ *Fechamento de ${data.monthLabel}${who}*` : `🗓️ *Seu ${data.monthLabel} até ontem${who}*`;

  const lines: string[] = [head];

  if (data.expenseCents > 0) {
    // Variação só com as duas bases > 0: mês anterior em branco costuma ser "não registrei", não "gastei zero".
    const change = data.compareExpenseCents !== null && data.compareExpenseCents > 0 ? percentChange(data.compareExpenseCents, data.expenseCents) : null;
    const compare = change === null ? '' : change === 0 ? ' (igual ao mesmo trecho do mês passado)' : ` (${change > 0 ? '+' : ''}${change.toLocaleString('pt-BR')}% vs. mesmo trecho do mês passado)`;
    lines.push(`💸 Gastos: ${formatBrl(data.expenseCents)}${compare}`);
  }
  // "Receitas" e não "saldo": quem não registra o que entra teria um saldo negativo falso.
  if (data.incomeCents > 0) lines.push(`💰 Receitas registradas: ${formatBrl(data.incomeCents)}`);
  if (data.topCategories.length > 0) {
    lines.push('📊 Onde mais pesou:', ...data.topCategories.slice(0, 3).map((item) => `• ${categoryLabel(item.category)}: ${formatBrl(item.cents)}`));
  }
  if (data.completedTasks !== null && data.completedTasks > 0) {
    lines.push(`✅ Tarefas concluídas: ${data.completedTasks}`);
  }
  if (data.habitCheckins !== null && data.habitCheckins > 0) {
    lines.push(`💪 Hábitos marcados: ${data.habitCheckins} ${plural(data.habitCheckins, 'vez', 'vezes')}`);
  }
  if (data.billsCount > 0) {
    lines.push(`🧾 Contas fixas: ${formatBrl(data.billsTotalCents)} por mês (${data.billsCount} ${plural(data.billsCount, 'conta', 'contas')})`);
  }

  if (lines.length === 1) {
    return `${head}\nAinda não tenho nada registrado nesse período.\nÉ só me contar seus gastos e tarefas, tipo "gastei 50 no mercado", que eu monto o resumo.`;
  }

  const closing = data.expenseCents > 0 ? 'Quer definir um limite de gasto pra alguma categoria, ou uma meta pro próximo mês?' : 'Quer que eu monte uma meta ou um plano pro que vem aí?';
  return `${lines.join('\n')}\n\n${closing}`;
}
