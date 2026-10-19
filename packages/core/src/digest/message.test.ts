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

  it('não inclui a linha de extras quando nenhum contador não-financeiro é passado', () => {
    const summary: TransactionSummary = { totalIncomeCents: 0, totalExpenseCents: 0, byCategory: {}, count: 0 };
    expect(formatWeeklyDigestMessage(summary)).not.toContain('Além disso');
  });

  it('inclui tarefa/meta/nota no resumo quando os contadores extras são passados', () => {
    const summary: TransactionSummary = { totalIncomeCents: 0, totalExpenseCents: 0, byCategory: {}, count: 0 };
    const message = formatWeeklyDigestMessage(summary, { pendingTasksCount: 2, activeGoalsCount: 1, notesThisWeekCount: 3 });

    expect(message).toContain('2 tarefa(s) pendente(s)');
    expect(message).toContain('1 meta(s) em andamento');
    expect(message).toContain('3 nota(s) nova(s)');
  });

  it('omite só o contador que vier zero/ausente, mantendo os outros', () => {
    const summary: TransactionSummary = { totalIncomeCents: 0, totalExpenseCents: 0, byCategory: {}, count: 0 };
    const message = formatWeeklyDigestMessage(summary, { pendingTasksCount: 5 });

    expect(message).toContain('5 tarefa(s) pendente(s)');
    expect(message).not.toContain('meta(s)');
    expect(message).not.toContain('nota(s)');
  });
});

describe('formatWeeklyDigestMessage com semana anterior', () => {
  const current = { totalIncomeCents: 0, totalExpenseCents: 15000, byCategory: { Mercado: 15000 } } as never;

  it('mostra a variação percentual quando há gasto nas duas semanas', () => {
    const previous = { totalIncomeCents: 0, totalExpenseCents: 10000, byCategory: {} } as never;
    const message = formatWeeklyDigestMessage(current, { previousSummary: previous }).replace(/\u00a0/g, ' ');
    expect(message).toContain('50% acima da semana anterior (R$ 100,00)');
  });

  it('não compara quando a semana anterior não tem gasto', () => {
    const previous = { totalIncomeCents: 0, totalExpenseCents: 0, byCategory: {} } as never;
    expect(formatWeeklyDigestMessage(current, { previousSummary: previous })).not.toContain('semana anterior');
  });
});
