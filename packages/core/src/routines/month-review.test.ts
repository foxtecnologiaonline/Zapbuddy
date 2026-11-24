import { describe, expect, it } from 'vitest';
import { formatMonthReview, type MonthReviewData } from './month-review.js';

const emoji = /\p{Extended_Pictographic}/gu;
const base: MonthReviewData = {
  name: 'Ana',
  period: 'current',
  monthLabel: 'novembro',
  expenseCents: 150000,
  incomeCents: 0,
  compareExpenseCents: null,
  topCategories: [],
  completedTasks: null,
  habitCheckins: null,
  billsCount: 0,
  billsTotalCents: 0,
};

describe('formatMonthReview', () => {
  it('cabeçalho: "até ontem" no mês corrente e "Fechamento de" no mês passado', () => {
    expect(formatMonthReview(base)).toContain('*Seu novembro até ontem, Ana*');
    expect(formatMonthReview({ ...base, period: 'previous', monthLabel: 'outubro' })).toContain('*Fechamento de outubro, Ana*');
    expect(formatMonthReview({ ...base, name: null })).toContain('*Seu novembro até ontem*');
  });

  it('compara com o mesmo trecho do mês passado só quando as duas bases têm gasto', () => {
    expect(formatMonthReview({ ...base, expenseCents: 150000, compareExpenseCents: 100000 })).toContain('(+50% vs. mesmo trecho do mês passado)');
    expect(formatMonthReview({ ...base, expenseCents: 50000, compareExpenseCents: 100000 })).toContain('(-50% vs.');
    expect(formatMonthReview({ ...base, expenseCents: 100000, compareExpenseCents: 100000 })).toContain('(igual ao mesmo trecho do mês passado)');
    // base zero costuma ser "não registrei", não "gastei zero": sem comparação
    expect(formatMonthReview({ ...base, compareExpenseCents: 0 })).not.toContain('vs.');
    expect(formatMonthReview({ ...base, compareExpenseCents: null })).not.toContain('vs.');
  });

  it('receitas aparecem como "registradas" (nunca um saldo que seria falso pra quem não registra o que entra)', () => {
    const text = formatMonthReview({ ...base, incomeCents: 500000 });
    expect(text).toMatch(/Receitas registradas: R\$\s?5\.000,00/);
    expect(text).not.toMatch(/saldo/i);
    expect(formatMonthReview(base)).not.toContain('Receitas');
  });

  it('top categorias (até 3, rótulo legível), tarefas, hábitos e contas fixas', () => {
    const text = formatMonthReview({
      ...base,
      topCategories: [
        { category: 'alimentacao', cents: 60000 },
        { category: 'transporte', cents: 30000 },
        { category: 'lazer', cents: 20000 },
        { category: 'outros', cents: 10000 },
      ],
      completedTasks: 12,
      habitCheckins: 1,
      billsCount: 2,
      billsTotalCents: 130000,
    });
    expect(text).toMatch(/• alimentação: R\$\s?600,00/);
    expect(text).toContain('• lazer');
    expect(text).not.toContain('• outros');
    expect(text).toContain('✅ Tarefas concluídas: 12');
    expect(text).toContain('💪 Hábitos marcados: 1 vez');
    expect(text).not.toContain('1 vezes');
    expect(text).toMatch(/Contas fixas: R\$\s?1\.300,00 por mês \(2 contas\)/);
  });

  it('fonte que não leu some da mensagem em vez de virar zero', () => {
    const text = formatMonthReview({ ...base, completedTasks: null, habitCheckins: null });
    expect(text).not.toContain('Tarefas concluídas');
    expect(text).not.toContain('Hábitos');
    expect(formatMonthReview({ ...base, completedTasks: 0 })).not.toContain('Tarefas concluídas');
  });

  it('sem nada registrado: diz isso e ensina a registrar (não monta um resumo vazio)', () => {
    const text = formatMonthReview({ ...base, expenseCents: 0 });
    expect(text).toContain('Ainda não tenho nada registrado');
    expect(text).toContain('gastei 50 no mercado');
  });

  it('fecha com uma pergunta (proposição) e respeita 1 emoji por linha', () => {
    const text = formatMonthReview({ ...base, incomeCents: 1, topCategories: [{ category: 'lazer', cents: 1 }], completedTasks: 3, habitCheckins: 2, billsCount: 1, billsTotalCents: 1 });
    expect(text.trim().endsWith('?')).toBe(true);
    for (const line of text.split('\n')) expect((line.match(emoji) ?? []).length, line).toBeLessThanOrEqual(1);
  });
});
