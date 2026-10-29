import { describe, expect, it } from 'vitest';
import { CalcError, evaluateExpression } from './expression.js';
import { compoundInterest, installmentsFromTotal, percentChange, percentOf, splitBill, totalFromInstallments } from './finance.js';

describe('evaluateExpression', () => {
  it('precedência e parênteses', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluateExpression('-3 + 5')).toBe(2);
    expect(evaluateExpression('10 / 4')).toBe(2.5);
  });

  it('não sofre do erro de float clássico', () => {
    expect(evaluateExpression('0.1 + 0.2')).toBe(0.3);
  });

  it('porcentagem do jeito humano: base + 10% é 10% DA base', () => {
    expect(evaluateExpression('100 + 10%')).toBe(110);
    expect(evaluateExpression('100 - 25%')).toBe(75);
    expect(evaluateExpression('200 * 10%')).toBe(20);
    expect(evaluateExpression('50%')).toBe(0.5);
  });

  it('aceita × e ÷', () => {
    expect(evaluateExpression('6 × 7')).toBe(42);
    expect(evaluateExpression('9 ÷ 3')).toBe(3);
  });

  it('recusa o que não é conta, vírgula decimal e divisão por zero', () => {
    for (const bad of ['', '2 +', '(2 + 3', '2 + abc', 'process.exit()', '1,5 + 1', '1 / 0', '1..2 + 1', '2 + 3)']) {
      expect(() => evaluateExpression(bad), bad).toThrow(CalcError);
    }
  });

  it('limita tamanho e profundidade', () => {
    expect(() => evaluateExpression('1+'.repeat(150) + '1')).toThrow(CalcError);
    expect(() => evaluateExpression('('.repeat(60) + '1' + ')'.repeat(60))).toThrow(CalcError);
  });
});

describe('finanças exatas em centavos', () => {
  it('racha a conta: soma exata, sobra de centavos nas primeiras pessoas', () => {
    const result = splitBill(10000, 3);
    expect(result.perPersonCents).toEqual([3334, 3333, 3333]);
    expect(result.perPersonCents.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('racha com gorjeta de 10%', () => {
    const result = splitBill(20000, 4, 10);
    expect(result.totalWithTipCents).toBe(22000);
    expect(result.perPersonCents).toEqual([5500, 5500, 5500, 5500]);
  });

  it('parcelamento sem juros divide exato; com juros usa Price e mostra o custo', () => {
    expect(installmentsFromTotal(120000, 10)).toEqual({ count: 10, installmentCents: 12000, totalPaidCents: 120000, interestCents: 0 });
    const uneven = installmentsFromTotal(10000, 3);
    expect(uneven.installmentCents).toBe(3334);
    const withInterest = installmentsFromTotal(100000, 12, 2);
    expect(withInterest.installmentCents).toBeGreaterThan(9000);
    expect(withInterest.interestCents).toBeGreaterThan(0);
    expect(withInterest.totalPaidCents).toBe(withInterest.installmentCents * 12);
  });

  it('total a partir da parcela', () => {
    expect(totalFromInstallments(12000, 10)).toBe(120000);
  });

  it('juros compostos com aporte (simulação)', () => {
    const result = compoundInterest(100000, 1, 12, 10000);
    expect(result.investedCents).toBe(220000);
    expect(result.finalCents).toBeGreaterThan(result.investedCents);
    expect(result.earningsCents).toBe(result.finalCents - result.investedCents);
  });

  it('porcentagem e variação', () => {
    expect(percentOf(15, 200)).toBe(30);
    expect(percentChange(200, 250)).toBe(25);
    expect(percentChange(200, 150)).toBe(-25);
    expect(() => percentChange(0, 10)).toThrow(CalcError);
  });

  it('entradas inválidas viram erro claro, não número maluco', () => {
    expect(() => splitBill(0, 3)).toThrow(CalcError);
    expect(() => splitBill(1000, 0)).toThrow(CalcError);
    expect(() => installmentsFromTotal(1000, 0)).toThrow(CalcError);
  });
});
