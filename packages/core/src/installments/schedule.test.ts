import { describe, expect, it } from 'vitest';
import { installmentDueDates, monthKeyPlus, monthlyCommitments, planStatus } from './schedule.js';

const plan = { description: 'Notebook', installment_cents: 12000, total_installments: 10, first_due_month: '2026-11-01', due_day: 10 };

describe('installmentDueDates', () => {
  it('uma parcela por mês, atravessando o ano', () => {
    const dates = installmentDueDates(plan);
    expect(dates[0]).toBe('2026-11-10');
    expect(dates[2]).toBe('2027-01-10');
    expect(dates).toHaveLength(10);
    expect(dates.at(-1)).toBe('2027-08-10');
  });

  it('dia 31 cai no último dia de mês curto (e bissexto)', () => {
    const dates = installmentDueDates({ first_due_month: '2027-01-01', due_day: 31, total_installments: 3 });
    expect(dates).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(installmentDueDates({ first_due_month: '2028-02-01', due_day: 31, total_installments: 1 })).toEqual(['2028-02-29']);
  });
});

describe('monthKeyPlus', () => {
  it('soma meses com virada de ano', () => {
    expect(monthKeyPlus('2026-11', 2)).toBe('2027-01');
    expect(monthKeyPlus('2026-01', 12)).toBe('2027-01');
  });
});

describe('planStatus', () => {
  it('antes da 1ª parcela: nada pago, tudo restante', () => {
    expect(planStatus(plan, '2026-10-29')).toEqual({ paid: 0, remaining: 10, remainingCents: 120000, nextDueDate: '2026-11-10', finished: false });
  });

  it('no meio: o calendário avança sozinho', () => {
    const status = planStatus(plan, '2027-01-15');
    expect(status.paid).toBe(3);
    expect(status.remaining).toBe(7);
    expect(status.remainingCents).toBe(84000);
    expect(status.nextDueDate).toBe('2027-02-10');
  });

  it('terminado', () => {
    expect(planStatus(plan, '2027-09-01')).toMatchObject({ remaining: 0, finished: true, nextDueDate: null });
  });
});

describe('monthlyCommitments', () => {
  const bills = [{ name: 'Aluguel', amountCents: 150000, dueDay: 5 }];

  it('soma parcelas e contas recorrentes mês a mês', () => {
    const result = monthlyCommitments([plan], bills, '2026-10-29', 3);
    expect(result.map((m) => m.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(result[1]).toMatchObject({ installmentsCents: 12000, billsCents: 150000, totalCents: 162000 });
    expect(result[1]!.items.map((i) => i.label)).toEqual(['Aluguel', 'Notebook (1/10)']);
  });

  it('mês corrente conta só o que ainda não passou', () => {
    const result = monthlyCommitments([], bills, '2026-10-29', 1);
    expect(result[0]).toMatchObject({ billsCents: 0, totalCents: 0 });
    expect(monthlyCommitments([], bills, '2026-10-03', 1)[0]!.billsCents).toBe(150000);
  });
});
