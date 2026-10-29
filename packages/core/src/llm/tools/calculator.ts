import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { CalcError, evaluateExpression } from '../../calc/expression.js';
import { compoundInterest, installmentsFromTotal, percentChange, percentOf, splitBill, totalFromInstallments } from '../../calc/finance.js';
import { formatBrl, formatNumberPtBr } from '../../calc/format.js';

const toCents = (reais: number) => Math.round(reais * 100);

export const calculateTool = defineTool({
  name: 'calculate',
  description:
    'Conta exata — NUNCA de cabeça. operation: expression ("1200*1.08"; + - * / ^ ( ) %, ponto decimal), percent_of (percent de amount), percent_change (amount para compare_to), split_bill (amount entre count pessoas, percent = gorjeta), installments (amount à vista em count parcelas, percent = juros ao mês), installments_total (parcela amount × count), compound_interest (SIMULAÇÃO: amount, percent ao mês, count meses, monthly_contribution; sem promessa de rendimento). Em reais.',
  schema: z.object({
    operation: z.enum(['expression', 'percent_of', 'percent_change', 'split_bill', 'installments', 'installments_total', 'compound_interest']),
    expression: z.string().max(200).optional(),
    amount: z.number().min(0).max(1e9).optional(),
    compare_to: z.number().max(1e9).optional(),
    percent: z.number().min(-100).max(1000).optional(),
    count: z.number().int().min(1).max(600).optional(),
    monthly_contribution: z.number().min(0).max(1e9).optional(),
  }),
  execute: async (params) => {
    try {
      switch (params.operation) {
        case 'expression': {
          if (!params.expression) return { ok: false, reason: 'expression_required' };
          const value = evaluateExpression(params.expression);
          return { ok: true, result: value, formatted: formatNumberPtBr(value) };
        }
        case 'percent_of': {
          if (params.percent === undefined || params.amount === undefined) return { ok: false, reason: 'percent_and_amount_required' };
          const value = percentOf(params.percent, params.amount);
          return { ok: true, result: value, formatted: formatNumberPtBr(value), as_money: formatBrl(toCents(value)) };
        }
        case 'percent_change': {
          if (params.amount === undefined || params.compare_to === undefined) return { ok: false, reason: 'amount_and_compare_to_required' };
          const change = percentChange(params.amount, params.compare_to);
          return { ok: true, change_percent: change, formatted: `${change > 0 ? '+' : ''}${formatNumberPtBr(change)}%` };
        }
        case 'split_bill': {
          if (params.amount === undefined || params.count === undefined) return { ok: false, reason: 'amount_and_count_required' };
          const split = splitBill(toCents(params.amount), params.count, params.percent ?? 0);
          const distinct = [...new Set(split.perPersonCents)];
          return {
            ok: true,
            total_with_tip: formatBrl(split.totalWithTipCents),
            per_person: distinct.length === 1 ? formatBrl(distinct[0]!) : undefined,
            // Sobra de centavos: as primeiras pessoas pagam 1 centavo a mais.
            per_person_amounts: distinct.length === 1 ? undefined : { higher: formatBrl(Math.max(...distinct)), lower: formatBrl(Math.min(...distinct)), people_paying_higher: split.perPersonCents.filter((c) => c === Math.max(...distinct)).length },
          };
        }
        case 'installments': {
          if (params.amount === undefined || params.count === undefined) return { ok: false, reason: 'amount_and_count_required' };
          const result = installmentsFromTotal(toCents(params.amount), params.count, params.percent ?? 0);
          return {
            ok: true,
            installment: formatBrl(result.installmentCents),
            total_paid: formatBrl(result.totalPaidCents),
            interest_paid: result.interestCents > 0 ? formatBrl(result.interestCents) : null,
          };
        }
        case 'installments_total': {
          if (params.amount === undefined || params.count === undefined) return { ok: false, reason: 'amount_and_count_required' };
          return { ok: true, total: formatBrl(totalFromInstallments(toCents(params.amount), params.count)) };
        }
        case 'compound_interest': {
          if (params.amount === undefined || params.percent === undefined || params.count === undefined) return { ok: false, reason: 'amount_percent_count_required' };
          const result = compoundInterest(toCents(params.amount), params.percent, params.count, toCents(params.monthly_contribution ?? 0));
          return {
            ok: true,
            simulation_only: true,
            final: formatBrl(result.finalCents),
            invested: formatBrl(result.investedCents),
            earnings: formatBrl(result.earningsCents),
          };
        }
      }
    } catch (error) {
      if (error instanceof CalcError) return { ok: false, reason: error.message };
      throw error;
    }
  },
});
