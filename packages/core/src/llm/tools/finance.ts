import { z } from 'zod';
import { recordTransaction, summarizeTransactions, updateLastTransaction, getBudget, upsertBudget } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, isRecognizedCategory, normalizeCategory } from '../categories.js';
import { getLast7DaysRange, getTodayRange, getMonthToDateRange, getPreviousMonthRange } from '../../time/zoned-ranges.js';
import { enqueueWebhookEvent } from '../../webhooks/dispatch.js';
import { assertReasonableOccurredAt } from '../date-sanity.js';

export const recordTransactionTool = defineTool({
  name: 'record_transaction',
  description:
    `Registra um gasto ou receita. OBRIGATÓRIO chamar antes de confirmar qualquer valor financeiro. Categorias de gasto: ${EXPENSE_CATEGORIES.join(', ')}. De receita: ${INCOME_CATEGORIES.join(', ')}. Sem encaixe, 'outros'.`,
  schema: z.object({
    type: z.enum(['expense', 'income']),
    amount_cents: z.number().int().positive(),
    // String livre em vez de enum: uma categoria fora da lista nunca pode
    // derrubar a chamada com erro de validação — normalizeCategory() lida
    // com isso abaixo, caindo em 'outros' em vez de falhar a conversa.
    category: z.string().min(1),
    description: z.string().optional(),
    occurred_at: z.string().datetime().optional(),
  }),
  execute: async (params, ctx) => {
    if (params.occurred_at) assertReasonableOccurredAt(params.occurred_at, 'occurred_at');

    const category = normalizeCategory(params.category);
    const transaction = await recordTransaction({
      accountId: ctx.accountId,
      userId: ctx.userId,
      type: params.type,
      amountCents: params.amount_cents,
      category,
      description: params.description,
      source: ctx.messageSource,
      occurredAt: params.occurred_at,
    });

    enqueueWebhookEvent(ctx.accountId, 'transaction.created', {
      transaction_id: transaction.id,
      type: transaction.type,
      amount_cents: transaction.amount_cents,
      category: transaction.category,
      occurred_at: transaction.occurred_at,
    });

    // Alerta de orçamento: só pra gasto, só se a pessoa configurou um limite
    // pra essa categoria (set_budget_alert) — sem limite configurado,
    // getBudget retorna null e isto é pulado silenciosamente. Cálculo é
    // "quanto já foi gasto nessa categoria no mês corrente" via a mesma
    // agregação SQL determinística do resumo financeiro — nunca o LLM
    // decidindo se passou do limite.
    let budgetAlert: { category: string; spent_cents: number; limit_cents: number } | undefined;
    if (params.type === 'expense') {
      const budget = await getBudget(ctx.accountId, category);
      if (budget) {
        const monthRange = getMonthToDateRange(ctx.timezone);
        const monthSummary = await summarizeTransactions(ctx.accountId, monthRange.startIso, monthRange.endIso);
        const spentCents = monthSummary.byCategory[category] ?? 0;
        if (spentCents >= budget.limit_cents) {
          budgetAlert = { category, spent_cents: spentCents, limit_cents: budget.limit_cents };
        }
      }
    }

    return {
      transaction_id: transaction.id,
      recorded: true,
      // Categoria normalizada (não a que o modelo mandou) + se caiu em
      // fallback — vai pro tool_call_log via orchestrator.ts, que é "o
      // principal insumo de debug de erros de interpretação" (CLAUDE.md).
      // Sem isso, auditar precisão de categorização exigia cruzar com a
      // tabela transactions em vez de olhar o log da tool diretamente.
      category: transaction.category,
      category_fallback: !isRecognizedCategory(params.category),
      budget_alert: budgetAlert,
    };
  },
});

export const correctLastTransactionTool = defineTool({
  name: 'correct_last_transaction',
  description:
    'Corrige o lançamento mais recente (até 30 min) quando ela avisa logo depois que errou ("errei, foi 54 não 45"). Só os campos que mudaram. NUNCA use record_transaction pra consertar (duplicaria). corrected:false → diga que não achou lançamento recente e ofereça registrar como novo.',
  schema: z
    .object({
      amount_cents: z.number().int().positive().optional(),
      category: z.string().min(1).optional(),
      description: z.string().optional(),
    })
    .refine((value) => value.amount_cents !== undefined || value.category !== undefined || value.description !== undefined, {
      message: 'Informe ao menos um campo para corrigir (amount_cents, category ou description).',
    }),
  execute: async (params, ctx) => {
    const category = params.category !== undefined ? normalizeCategory(params.category) : undefined;
    const updated = await updateLastTransaction({
      accountId: ctx.accountId,
      amountCents: params.amount_cents,
      category,
      description: params.description,
    });

    if (!updated) {
      return { corrected: false, reason: 'no_recent_transaction' };
    }

    return {
      corrected: true,
      transaction_id: updated.id,
      amount_cents: updated.amount_cents,
      category: updated.category,
      category_fallback: params.category !== undefined ? !isRecognizedCategory(params.category) : undefined,
    };
  },
});

export const setBudgetAlertTool = defineTool({
  name: 'set_budget_alert',
  description:
    'Define/substitui o limite mensal de uma categoria ("me avisa se passar de 500 em mercado"); record_transaction sinaliza ao atingir.',
  schema: z.object({
    category: z.string().min(1),
    limit_cents: z.number().int().positive(),
  }),
  execute: async (params, ctx) => {
    const category = normalizeCategory(params.category);
    const budget = await upsertBudget(ctx.accountId, category, params.limit_cents);
    return { set: true, category: budget.category, limit_cents: budget.limit_cents };
  },
});

export const getSummaryTool = defineTool({
  name: 'get_financial_summary',
  description:
    'Resumo financeiro (receitas, gastos, byCategory) de \'today\', \'last_7_days\', \'this_month\' ou \'last_month\', já no fuso dela — nunca gere datas. "Quanto gastei com X" → byCategory.',
  schema: z.object({
    period: z.enum(['today', 'last_7_days', 'this_month', 'last_month']),
  }),
  execute: async (params, ctx) => {
    const ranges = {
      today: getTodayRange,
      last_7_days: getLast7DaysRange,
      this_month: getMonthToDateRange,
      last_month: getPreviousMonthRange,
    };
    const range = ranges[params.period](ctx.timezone);
    const summary = await summarizeTransactions(ctx.accountId, range.startIso, range.endIso);
    return { period: params.period, ...summary };
  },
});
