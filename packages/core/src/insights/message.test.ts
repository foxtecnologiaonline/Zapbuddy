import { describe, expect, it } from 'vitest';
import { formatProactiveInsightMessage, summarizeSignalForLog } from './message.js';
import type { ProactiveSignal } from './signals.js';

describe('formatProactiveInsightMessage', () => {
  it('formata o sinal de categoria em reais, mencionando a categoria', () => {
    const signal: ProactiveSignal = { type: 'category_spike', category: 'mercado', currentWeekCents: 12_000, weeklyAverageCents: 6_000 };
    const message = formatProactiveInsightMessage(signal);

    expect(message).toContain('mercado');
    expect(message).toMatch(/R\$\s?120,00/);
    expect(message).toMatch(/R\$\s?60,00/);
  });

  it('formata o sinal de ritmo mensal com o valor projetado e o do mês anterior', () => {
    const signal: ProactiveSignal = { type: 'monthly_pace', projectedCents: 500_000, previousMonthCents: 400_000 };
    const message = formatProactiveInsightMessage(signal);

    expect(message).toMatch(/R\$\s?5\.000,00/);
    expect(message).toMatch(/R\$\s?4\.000,00/);
  });

  it('nunca lança e sempre devolve uma string não vazia (template aleatório entre variações)', () => {
    const signal: ProactiveSignal = { type: 'category_spike', category: 'transporte', currentWeekCents: 8_000, weeklyAverageCents: 4_000 };
    for (let i = 0; i < 20; i++) {
      expect(formatProactiveInsightMessage(signal).length).toBeGreaterThan(0);
    }
  });
});

describe('summarizeSignalForLog', () => {
  it('resume o sinal de categoria em texto curto pra auditoria', () => {
    const signal: ProactiveSignal = { type: 'category_spike', category: 'lazer', currentWeekCents: 10_000, weeklyAverageCents: 5_000 };
    expect(summarizeSignalForLog(signal)).toBe('categoria=lazer semana=10000 media=5000');
  });

  it('resume o sinal de ritmo mensal em texto curto pra auditoria', () => {
    const signal: ProactiveSignal = { type: 'monthly_pace', projectedCents: 500_000, previousMonthCents: 400_000 };
    expect(summarizeSignalForLog(signal)).toBe('projetado=500000 mes_anterior=400000');
  });
});
