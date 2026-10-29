import { CalcError } from './expression.js';

/** Contas de dinheiro em CENTAVOS inteiros — sem float na parte que vira valor. */

export interface SplitBillResult {
  totalWithTipCents: number;
  /** Quanto cada pessoa paga; a sobra de centavos vai pras primeiras (soma exata). */
  perPersonCents: number[];
}

export function splitBill(totalCents: number, people: number, tipPercent = 0): SplitBillResult {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new CalcError('O total precisa ser maior que zero.');
  if (!Number.isInteger(people) || people < 1 || people > 100) throw new CalcError('Número de pessoas inválido.');
  if (tipPercent < 0 || tipPercent > 100) throw new CalcError('Gorjeta inválida.');

  const totalWithTipCents = Math.round(totalCents * (1 + tipPercent / 100));
  const base = Math.floor(totalWithTipCents / people);
  const remainder = totalWithTipCents - base * people;
  return { totalWithTipCents, perPersonCents: Array.from({ length: people }, (_, index) => base + (index < remainder ? 1 : 0)) };
}

export interface InstallmentResult {
  count: number;
  /** Valor da parcela "regular"; se a divisão não for exata, as primeiras levam 1 centavo a mais. */
  installmentCents: number;
  /** Soma exata das parcelas. */
  totalPaidCents: number;
  /** Juros embutidos: o que se paga a mais que o valor à vista (0 quando sem juros). */
  interestCents: number;
}

/**
 * Parcelamento do valor à vista. Sem juros: divisão exata em centavos. Com juros
 * mensais: tabela Price (parcela fixa) — é a conta padrão de loja/cartão.
 */
export function installmentsFromTotal(totalCents: number, count: number, monthlyInterestPercent = 0): InstallmentResult {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new CalcError('O valor precisa ser maior que zero.');
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new CalcError('Número de parcelas inválido.');
  if (monthlyInterestPercent < 0 || monthlyInterestPercent > 30) throw new CalcError('Juros mensais fora do esperado.');

  if (monthlyInterestPercent === 0) {
    const base = Math.floor(totalCents / count);
    const remainder = totalCents - base * count;
    return { count, installmentCents: base + (remainder > 0 ? 1 : 0), totalPaidCents: totalCents, interestCents: 0 };
  }

  const rate = monthlyInterestPercent / 100;
  const payment = Math.round((totalCents * rate) / (1 - (1 + rate) ** -count));
  return { count, installmentCents: payment, totalPaidCents: payment * count, interestCents: payment * count - totalCents };
}

export function totalFromInstallments(installmentCents: number, count: number): number {
  if (!Number.isInteger(installmentCents) || installmentCents <= 0 || !Number.isInteger(count) || count < 1) throw new CalcError('Parcela inválida.');
  return installmentCents * count;
}

export interface CompoundResult {
  finalCents: number;
  investedCents: number;
  earningsCents: number;
}

/** SIMULAÇÃO de juros compostos com taxa que a PESSOA informou — nunca promessa de rendimento. */
export function compoundInterest(principalCents: number, monthlyRatePercent: number, months: number, monthlyContributionCents = 0): CompoundResult {
  if (principalCents < 0 || monthlyContributionCents < 0) throw new CalcError('Valores não podem ser negativos.');
  if (!Number.isInteger(months) || months < 1 || months > 600) throw new CalcError('Prazo inválido.');
  if (monthlyRatePercent < -50 || monthlyRatePercent > 50) throw new CalcError('Taxa fora do esperado.');

  const rate = monthlyRatePercent / 100;
  let balance = principalCents;
  for (let month = 0; month < months; month += 1) balance = balance * (1 + rate) + monthlyContributionCents;
  const invested = principalCents + monthlyContributionCents * months;
  const finalCents = Math.round(balance);
  return { finalCents, investedCents: invested, earningsCents: finalCents - invested };
}

export function percentOf(percent: number, base: number): number {
  return Math.round(((percent / 100) * base) * 1e8) / 1e8;
}

export function percentChange(from: number, to: number): number {
  if (from === 0) throw new CalcError('Não dá pra calcular variação a partir de zero.');
  return Math.round(((to - from) / Math.abs(from)) * 100 * 100) / 100;
}
