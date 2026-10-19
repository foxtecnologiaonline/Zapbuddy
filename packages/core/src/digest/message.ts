import type { TransactionSummary } from '@zapbuddy/db';

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Contadores não-financeiros pra turbinar o resumo semanal (posicionamento
 * B2C: "lembra de tudo", não só financeiro) — cada campo opcional porque o
 * caller decide o que buscar; zero chamada ao LLM, só contagem pura.
 */
export interface WeeklyDigestExtras {
  pendingTasksCount?: number;
  activeGoalsCount?: number;
  notesThisWeekCount?: number;
  /** Semana anterior pra comparar gasto — ausente = sem linha de comparação. */
  previousSummary?: TransactionSummary;
}

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

function formatExtrasLine(extras: WeeklyDigestExtras): string {
  const parts: string[] = [];
  if (extras.pendingTasksCount) parts.push(`${extras.pendingTasksCount} tarefa(s) pendente(s)`);
  if (extras.activeGoalsCount) parts.push(`${extras.activeGoalsCount} meta(s) em andamento`);
  if (extras.notesThisWeekCount) parts.push(`${extras.notesThisWeekCount} nota(s) nova(s)`);

  return parts.length === 0 ? '' : `\nAlém disso: ${parts.join(', ')}.`;
}

/**
 * Resumo semanal proativo — diferente dos insights da Fase 3 (que só disparam
 * quando um sinal de anomalia é detectado), este sempre manda, 1x/semana:
 * "como foi a semana", não "algo está fora do normal". Template fixo (sem
 * chamada ao LLM), mesmo raciocínio do insights/message.ts.
 */
export function formatWeeklyDigestMessage(summary: TransactionSummary, extras: WeeklyDigestExtras = {}): string {
  const topCategories = Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([category, cents]) => `${category}: ${formatBRL(cents)}`)
    .join(', ');

  const categoriesLine = topCategories ? `\nMaiores gastos: ${topCategories}.` : '';
  const comparisonLine = extras.previousSummary ? describeVsPreviousWeek(summary, extras.previousSummary) : '';

  return (
    `📊 Resumo da semana: ${formatBRL(summary.totalIncomeCents)} em receita, ` +
    `${formatBRL(summary.totalExpenseCents)} em gastos.${categoriesLine}${comparisonLine}${formatExtrasLine(extras)}`
  );
}
