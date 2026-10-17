import { createTransaction, summarizeTransactions } from '../../repositories/transactions';
import type { ToolDefinition, ToolHandler } from './types';

export const registrarTransacaoTool: ToolDefinition = {
  name: 'registrar_transacao',
  description:
    'Registra um gasto ou receita do negócio do cliente. Use sempre que o cliente mencionar uma compra, venda, pagamento recebido ou despesa, mesmo que de forma informal. Nunca confirme um registro financeiro pro cliente sem ter chamado essa tool antes — nunca invente que algo foi registrado.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['gasto', 'receita'], description: 'gasto (saída) ou receita (entrada)' },
      valor: { type: 'number', description: 'valor em reais, ex: 49.90' },
      categoria: {
        type: 'string',
        description: 'categoria inferida pelo contexto, ex: alimentação, transporte, material, serviço, venda',
      },
      descricao: { type: 'string', description: 'descrição curta opcional, ex: "almoço com cliente"' },
    },
    required: ['tipo', 'valor', 'categoria'],
  },
};

export const resumoFinanceiroTool: ToolDefinition = {
  name: 'resumo_financeiro',
  description: 'Busca o resumo de gastos e receitas do cliente num período (diário ou semanal).',
  input_schema: {
    type: 'object',
    properties: {
      periodo: {
        type: 'string',
        enum: ['hoje', 'semana'],
        description: 'hoje = últimas 24h, semana = últimos 7 dias',
      },
    },
    required: ['periodo'],
  },
};

interface RegistrarTransacaoInput {
  tipo: 'gasto' | 'receita';
  valor: number;
  categoria: string;
  descricao?: string;
}

export const handleRegistrarTransacao: ToolHandler = async (input: RegistrarTransacaoInput, context) => {
  if (typeof input.valor !== 'number' || !Number.isFinite(input.valor) || input.valor <= 0) {
    return JSON.stringify({ erro: 'valor inválido, precisa ser um número positivo' });
  }

  const transaction = await createTransaction({
    clientId: context.clientId,
    type: input.tipo === 'gasto' ? 'expense' : 'income',
    amountCents: Math.round(input.valor * 100),
    category: input.categoria,
    description: input.descricao ?? null,
  });

  return JSON.stringify({ registrado: true, id: transaction.id });
};

interface ResumoFinanceiroInput {
  periodo: 'hoje' | 'semana';
}

const PERIOD_TO_DAYS: Record<ResumoFinanceiroInput['periodo'], number> = { hoje: 1, semana: 7 };

export const handleResumoFinanceiro: ToolHandler = async (input: ResumoFinanceiroInput, context) => {
  const days = PERIOD_TO_DAYS[input.periodo] ?? 1;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const summary = await summarizeTransactions(context.clientId, since);

  return JSON.stringify({
    totalReceitas: summary.totalIncomeCents / 100,
    totalGastos: summary.totalExpenseCents / 100,
    quantidadeLancamentos: summary.count,
  });
};
