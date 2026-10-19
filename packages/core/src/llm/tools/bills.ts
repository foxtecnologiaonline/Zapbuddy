import { z } from 'zod';
import { createRecurringBill, deactivateRecurringBill, listActiveRecurringBills } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const createRecurringBillTool = defineTool({
  name: 'create_recurring_bill',
  description:
    'Cadastra uma conta que se repete todo mês (aluguel, luz, internet, assinatura) pra que o Tom avise antes do ' +
    'vencimento. Só com valor e dia de vencimento que a pessoa informou — nunca cria transação de pagamento sozinho. ' +
    'Pra registrar que a conta foi paga, use record_transaction.',
  schema: z.object({
    name: z.string().min(1).max(80),
    amount: z.number().positive().max(10_000_000),
    due_day: z.number().int().min(1).max(31),
  }),
  execute: async (params, ctx) => {
    const bill = await createRecurringBill({
      accountId: ctx.accountId,
      userId: ctx.userId,
      name: params.name,
      amountCents: Math.round(params.amount * 100),
      dueDay: params.due_day,
    });
    return { bill_id: bill.id, created: true };
  },
});

export const listRecurringBillsTool = defineTool({
  name: 'list_recurring_bills',
  description: 'Lista as contas recorrentes cadastradas da conta, pela ordem do dia de vencimento.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const bills = await listActiveRecurringBills(ctx.accountId);
    return {
      bills: bills.map((bill) => ({ bill_id: bill.id, name: bill.name, amount_cents: bill.amount_cents, due_day: bill.due_day })),
    };
  },
});

export const cancelRecurringBillTool = defineTool({
  name: 'cancel_recurring_bill',
  description: 'Para os avisos de uma conta recorrente, dado o bill_id. Use quando a pessoa não quer mais ser avisada dela.',
  schema: z.object({
    bill_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const bill = await deactivateRecurringBill(ctx.accountId, params.bill_id);
    return bill ? { cancelled: true, bill_id: bill.id } : { cancelled: false };
  },
});
