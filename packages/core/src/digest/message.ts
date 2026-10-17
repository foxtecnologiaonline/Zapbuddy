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
export function formatWeeklyDigestMessage(summary: TransactionSummary): string {
  const topCategories = Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([category, cents]) => `${category}: ${formatBRL(cents)}`)
    .join(', ');

  const categoriesLine = topCategories ? `\nMaiores gastos: ${topCategories}.` : '';

  return (
    `📊 Resumo da semana: ${formatBRL(summary.totalIncomeCents)} em receita, ` +
    `${formatBRL(summary.totalExpenseCents)} em gastos.${categoriesLine}`
  );
}
