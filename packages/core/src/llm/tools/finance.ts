import { z } from 'zod';
import { recordTransaction, summarizeTransactions } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../categories.js';

export const recordTransactionTool = defineTool({
  name: 'record_transaction',
  description:
    'Registra uma transação financeira (gasto ou receita) do usuário. ' +
    'OBRIGATÓRIO chamar esta tool antes de confirmar qualquer gasto/receita — ' +
    'nunca confirme um valor financeiro sem ter chamado esta tool primeiro.',
  schema: z.object({
    type: z.enum(['expense', 'income']),
    amount_cents: z.number().int().positive(),
    category: z.enum([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]),
    description: z.string().optional(),
    occurred_at: z.string().datetime().optional(),
  }),
  execute: async (params, ctx) => {
    const transaction = await recordTransaction({
      userId: ctx.userId,
      type: params.type,
      amountCents: params.amount_cents,
      category: params.category,
      description: params.description,
      source: ctx.messageSource,
      occurredAt: params.occurred_at,
    });
    return { transaction_id: transaction.id, recorded: true };
  },
});

export const getSummaryTool = defineTool({
  name: 'get_financial_summary',
  description: 'Retorna o resumo financeiro (receitas, gastos, por categoria) de um período.',
  schema: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  execute: async (params, ctx) => {
    return summarizeTransactions(ctx.userId, params.from, params.to);
  },
});
