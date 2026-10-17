import { z } from 'zod';
import { recordTransaction, summarizeTransactions, updateLastTransaction, getBudget, upsertBudget } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, isRecognizedCategory, normalizeCategory } from '../categories.js';
import { getLast7DaysRange, getTodayRange, getMonthToDateRange } from '../../time/zoned-ranges.js';
import { enqueueWebhookEvent } from '../../webhooks/dispatch.js';
import { assertReasonableOccurredAt } from '../date-sanity.js';

export const recordTransactionTool = defineTool({
  name: 'record_transaction',
  description:
    'Registra uma transação financeira (gasto ou receita) do usuário. ' +
    'OBRIGATÓRIO chamar esta tool antes de confirmar qualquer gasto/receita — ' +
    'nunca confirme um valor financeiro sem ter chamado esta tool primeiro. ' +
    `Categorias de gasto preferidas: ${EXPENSE_CATEGORIES.join(', ')}. ` +
    `Categorias de receita preferidas: ${INCOME_CATEGORIES.join(', ')}. ` +
    "Se nenhuma encaixar bem, use 'outros' — qualquer outro valor também é aceito e cai em 'outros'.",
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
    'Corrige a transação financeira mais recente do usuário (registrada há no máximo 30 minutos), ' +
    'para quando a pessoa avisa logo em seguida que errou algo (ex.: "errei, foi 54 não 45"). ' +
    'Informe só os campos que mudaram. NUNCA use record_transaction para "consertar" um lançamento ' +
    'recente — isso duplicaria o gasto/receita. Se não houver transação recente o bastante, a tool ' +
    'retorna corrected: false — nesse caso, diga à pessoa que não achou um lançamento recente para ' +
    'corrigir e pergunte se quer registrar como um novo gasto/receita.',
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
    'Define (ou substitui) um limite de gasto mensal para uma categoria — ex.: "me avisa se eu ' +
    'passar de 500 reais em mercado". A partir daí, toda vez que um gasto fizer o total do mês ' +
    'nessa categoria atingir o limite, record_transaction vai sinalizar isso automaticamente. ' +
    'Pedir de novo para a mesma categoria substitui o limite anterior.',
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
    "Retorna o resumo financeiro (receitas, gastos, por categoria) do período pedido: 'today' " +
    "(hoje) ou 'last_7_days' (últimos 7 dias). Os limites de data são calculados no fuso do " +
    'usuário — nunca gere from/to manualmente.',
  schema: z.object({
    period: z.enum(['today', 'last_7_days']),
  }),
  execute: async (params, ctx) => {
    const range = params.period === 'today' ? getTodayRange(ctx.timezone) : getLast7DaysRange(ctx.timezone);
    return summarizeTransactions(ctx.accountId, range.startIso, range.endIso);
  },
});
