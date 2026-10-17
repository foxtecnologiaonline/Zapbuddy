import { describe, expect, it } from 'vitest';
import { formatWeeklyDigestMessage } from './message.js';
import type { TransactionSummary } from '@zapbuddy/db';

describe('formatWeeklyDigestMessage', () => {
  it('formata receita e gasto total em reais', () => {
    const summary: TransactionSummary = {
      totalIncomeCents: 150_000,
      totalExpenseCents: 80_000,
      byCategory: { mercado: 50_000, transporte: 30_000 },
      count: 5,
    };

    const message = formatWeeklyDigestMessage(summary);
    expect(message).toMatch(/R\$\s?1\.500,00/);
    expect(message).toMatch(/R\$\s?800,00/);
    expect(message).toContain('mercado');
    expect(message).toContain('transporte');
  });

  it('não lista categorias quando não houve gasto', () => {
    const summary: TransactionSummary = { totalIncomeCents: 0, totalExpenseCents: 0, byCategory: {}, count: 0 };
    expect(formatWeeklyDigestMessage(summary)).not.toContain('Maiores gastos');
  });

  it('lista no máximo as 3 maiores categorias, em ordem decrescente', () => {
    const summary: TransactionSummary = {
      totalIncomeCents: 0,
      totalExpenseCents: 400,
      byCategory: { a: 100, b: 400, c: 300, d: 200 },
      count: 4,
    };
    const message = formatWeeklyDigestMessage(summary);
    const listPart = message.split('Maiores gastos: ')[1] ?? '';
    expect(listPart).toMatch(/^b: R\$\s?4,00, c: R\$\s?3,00, d: R\$\s?2,00\.$/);
    expect(listPart).not.toContain('a:');
  });
});
