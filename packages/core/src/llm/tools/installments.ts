import { z } from 'zod';
import { cancelInstallmentPlan, createInstallmentPlan, listActiveInstallmentPlans, listActiveRecurringBills } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { formatBrl } from '../../calc/format.js';
import { localDateKey } from '../../habits/streak.js';
import { installmentDueDates, monthKeyPlus, monthlyCommitments, planStatus } from '../../installments/schedule.js';

const DEFAULT_COMMITMENT_MONTHS = 6;

/** Primeiro mês cuja data de vencimento ainda não passou: este mês se o dia ainda vem, senão o próximo. */
function defaultFirstMonth(todayKey: string, dueDay: number): string {
  const month = todayKey.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Number(todayKey.slice(8, 10)) <= Math.min(dueDay, lastDay) ? month : monthKeyPlus(month, 1);
}

export const manageInstallmentsTool = defineTool({
  name: 'manage_installments',
  description:
    'Compras parceladas. action: create (description, installment_amount em reais, total_installments, due_day; first_due_month YYYY-MM opcional), list, commitments (comprometido por mês nos próximos months: parcelas + contas recorrentes), cancel (plan_id). NÃO lança gasto: pergunte se quer record_transaction.',
  schema: z.object({
    action: z.enum(['create', 'list', 'commitments', 'cancel']),
    description: z.string().min(1).max(80).optional(),
    installment_amount: z.number().positive().max(10_000_000).optional(),
    total_installments: z.number().int().min(1).max(120).optional(),
    due_day: z.number().int().min(1).max(31).optional(),
    first_due_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    plan_id: z.string().uuid().optional(),
    months: z.number().int().min(1).max(12).optional(),
  }),
  execute: async (params, ctx) => {
    const todayKey = localDateKey(ctx.timezone);

    if (params.action === 'create') {
      if (!params.description || params.installment_amount === undefined || !params.total_installments || !params.due_day) {
        return { created: false, reason: 'description_installment_amount_total_installments_due_day_required' };
      }
      const firstMonth = params.first_due_month ?? defaultFirstMonth(todayKey, params.due_day);
      const monthNumber = Number(firstMonth.slice(5, 7));
      if (monthNumber < 1 || monthNumber > 12) return { created: false, reason: 'invalid_first_due_month' };

      const plan = await createInstallmentPlan({
        accountId: ctx.accountId,
        userId: ctx.userId,
        description: params.description,
        installmentCents: Math.round(params.installment_amount * 100),
        totalInstallments: params.total_installments,
        firstDueMonth: `${firstMonth}-01`,
        dueDay: params.due_day,
      });
      const dates = installmentDueDates(plan);
      return {
        created: true,
        plan_id: plan.id,
        installment: formatBrl(plan.installment_cents),
        total: formatBrl(plan.installment_cents * plan.total_installments),
        first_due_date: dates[0],
        last_due_date: dates.at(-1),
        purchase_not_recorded_as_expense: true,
      };
    }

    if (params.action === 'cancel') {
      if (!params.plan_id) return { cancelled: false, reason: 'plan_id_required' };
      const plan = await cancelInstallmentPlan(ctx.accountId, params.plan_id);
      return plan ? { cancelled: true, description: plan.description } : { cancelled: false, reason: 'plan_not_found' };
    }

    const plans = await listActiveInstallmentPlans(ctx.accountId);

    if (params.action === 'list') {
      const withStatus = plans.map((plan) => ({ plan, status: planStatus(plan, todayKey) }));
      return {
        plans: withStatus
          .filter(({ status }) => !status.finished)
          .map(({ plan, status }) => ({
            plan_id: plan.id,
            description: plan.description,
            installment: formatBrl(plan.installment_cents),
            paid: status.paid,
            total: plan.total_installments,
            remaining: status.remaining,
            remaining_amount: formatBrl(status.remainingCents),
            next_due_date: status.nextDueDate,
          })),
        finished_count: withStatus.filter(({ status }) => status.finished).length,
      };
    }

    // commitments
    const bills = await listActiveRecurringBills(ctx.accountId);
    const months = monthlyCommitments(
      plans,
      bills.map((bill) => ({ name: bill.name, amountCents: bill.amount_cents, dueDay: bill.due_day })),
      todayKey,
      params.months ?? DEFAULT_COMMITMENT_MONTHS,
    );
    return {
      months: months.map((month) => ({
        month: month.month,
        total: formatBrl(month.totalCents),
        installments: formatBrl(month.installmentsCents),
        recurring_bills: formatBrl(month.billsCents),
        items: month.items.map((item) => ({ label: item.label, amount: formatBrl(item.amountCents), due_date: item.dueDate })),
      })),
      note: 'Só o que a pessoa cadastrou; o mês atual conta apenas o que ainda vence a partir de hoje.',
    };
  },
});
