import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRegistrarTransacao, handleResumoFinanceiro } from './finance-tools';

const createTransactionCalls: unknown[] = [];

vi.mock('../../repositories/transactions', () => ({
  createTransaction: vi.fn(async (input: unknown) => {
    createTransactionCalls.push(input);
    return { id: 'tx1', ...(input as object) };
  }),
  summarizeTransactions: vi.fn(async (_clientId: string, sinceISO: string) => {
    return { totalIncomeCents: 20000, totalExpenseCents: 4990, count: 2, _since: sinceISO } as any;
  }),
}));

describe('handleRegistrarTransacao', () => {
  beforeEach(() => {
    createTransactionCalls.length = 0;
  });

  it('converte reais pra centavos e persiste antes de confirmar', async () => {
    const result = await handleRegistrarTransacao(
      { tipo: 'gasto', valor: 49.9, categoria: 'alimentação', descricao: 'almoço' },
      { clientId: 'c1' },
    );

    expect(createTransactionCalls).toEqual([
      { clientId: 'c1', type: 'expense', amountCents: 4990, category: 'alimentação', description: 'almoço' },
    ]);
    expect(JSON.parse(result)).toEqual({ registrado: true, id: 'tx1' });
  });

  it('mapeia receita pra income', async () => {
    await handleRegistrarTransacao({ tipo: 'receita', valor: 200, categoria: 'venda' }, { clientId: 'c1' });

    expect(createTransactionCalls[0]).toMatchObject({ type: 'income', amountCents: 20000 });
  });

  it('rejeita valor zero ou negativo sem persistir', async () => {
    const result = await handleRegistrarTransacao({ tipo: 'gasto', valor: 0, categoria: 'x' }, { clientId: 'c1' });

    expect(createTransactionCalls).toHaveLength(0);
    expect(JSON.parse(result)).toHaveProperty('erro');
  });

  it('rejeita valor não numérico sem persistir', async () => {
    const result = await handleRegistrarTransacao(
      { tipo: 'gasto', valor: 'quarenta e nove e noventa' as unknown as number, categoria: 'x' },
      { clientId: 'c1' },
    );

    expect(createTransactionCalls).toHaveLength(0);
    expect(JSON.parse(result)).toHaveProperty('erro');
  });
});

describe('handleResumoFinanceiro', () => {
  it('converte centavos pra reais na resposta', async () => {
    const result = await handleResumoFinanceiro({ periodo: 'semana' }, { clientId: 'c1' });

    expect(JSON.parse(result)).toEqual({
      totalReceitas: 200,
      totalGastos: 49.9,
      quantidadeLancamentos: 2,
    });
  });
});
