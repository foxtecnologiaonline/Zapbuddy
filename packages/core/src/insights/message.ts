import type { ProactiveSignal } from './signals.js';

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mais de uma variação por sinal — só pra não soar com a mesma frase toda
// vez que dispara (ADR 0003, decisão 1: template fixo, não geração por LLM,
// mas isso não precisa significar sempre a mesma frase).
const CATEGORY_SPIKE_TEMPLATES = [
  (category: string, current: string, average: string) =>
    `Reparei que seu gasto com ${category} essa semana (${current}) tá bem acima do normal (média de ${average}/semana). Vale uma olhada? 👀`,
  (category: string, current: string, average: string) =>
    `Ó, ${category} essa semana veio ${current} — mais que o dobro da sua média de ${average}. Pode ser coisa pontual, só queria te avisar.`,
];

const MONTHLY_PACE_TEMPLATES = [
  (projected: string, previous: string) =>
    `No ritmo atual, seus gastos esse mês devem fechar perto de ${projected} — acima do mês passado (${previous}). Ainda dá tempo de ajustar se quiser.`,
  (projected: string, previous: string) =>
    `Se continuar nesse ritmo, o mês deve fechar em torno de ${projected}, contra ${previous} no mês anterior. Fica a dica. 📈`,
];

function pickTemplate<T>(templates: T[]): T {
  return templates[Math.floor(Math.random() * templates.length)]!;
}

export function formatProactiveInsightMessage(signal: ProactiveSignal): string {
  if (signal.type === 'category_spike') {
    const template = pickTemplate(CATEGORY_SPIKE_TEMPLATES);
    return template(signal.category, formatBRL(signal.currentWeekCents), formatBRL(signal.weeklyAverageCents));
  }
  const template = pickTemplate(MONTHLY_PACE_TEMPLATES);
  return template(formatBRL(signal.projectedCents), formatBRL(signal.previousMonthCents));
}

/** Resumo curto pra log/auditoria (proactive_insight_logs.summary) — não é o que o usuário recebe. */
export function summarizeSignalForLog(signal: ProactiveSignal): string {
  if (signal.type === 'category_spike') {
    return `categoria=${signal.category} semana=${signal.currentWeekCents} media=${signal.weeklyAverageCents}`;
  }
  return `projetado=${signal.projectedCents} mes_anterior=${signal.previousMonthCents}`;
}
