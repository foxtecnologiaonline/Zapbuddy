import type { TransactionSummary } from '@zapbuddy/db';

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Resumo semanal proativo — diferente dos insights da Fase 3 (que só disparam
 * quando um sinal de anomalia é detectado), este sempre manda, 1x/semana:
 * "como foi a semana", não "algo está fora do normal". Template fixo (sem
 * chamada ao LLM), mesmo raciocínio do insights/message.ts.
 */
/**
 * Comparação com a semana anterior só aparece quando as duas semanas têm
 * gasto registrado — sem base de comparação, a frase seria inventada.
 */
function describeVsPreviousWeek(current: TransactionSummary, previous: TransactionSummary): string {
  if (previous.totalExpenseCents === 0 || current.totalExpenseCents === 0) return '';
  const diffPercent = Math.round(((current.totalExpenseCents - previous.totalExpenseCents) / previous.totalExpenseCents) * 100);
  if (diffPercent === 0) return '\nOs gastos ficaram iguais aos da semana anterior.';
  const direction = diffPercent > 0 ? 'acima' : 'abaixo';
  return `\nOs gastos ficaram ${Math.abs(diffPercent)}% ${direction} da semana anterior (${formatBRL(previous.totalExpenseCents)}).`;
}

export function formatWeeklyDigestMessage(summary: TransactionSummary, previous?: TransactionSummary): string {
  const topCategories = Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([category, cents]) => `${category}: ${formatBRL(cents)}`)
    .join(', ');

  const categoriesLine = topCategories ? `\nMaiores gastos: ${topCategories}.` : '';
  const comparisonLine = previous ? describeVsPreviousWeek(summary, previous) : '';

  return (
    `📊 Resumo da semana: ${formatBRL(summary.totalIncomeCents)} em receita, ` +
    `${formatBRL(summary.totalExpenseCents)} em gastos.${categoriesLine}${comparisonLine}`
  );
}
