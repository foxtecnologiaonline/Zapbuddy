import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  logToolCall: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const registry = vi.hoisted(() => ({ execute: vi.fn(), getToolByName: vi.fn() }));

vi.mock('@zapbuddy/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@zapbuddy/db')>()), ...db }));
vi.mock('./tool-registry.js', () => ({ getToolByName: registry.getToolByName }));

import { z } from 'zod';
import { runToolCall } from './tool-runner.js';
import { TurnLedger } from './turn-ledger.js';
import type { ToolContext } from './tool-types.js';

const baseCtx: ToolContext = { userId: 'u1', whatsappNumber: '5511999990000', messageSource: 'text', timezone: 'America/Sao_Paulo', accountId: 'a1', role: 'owner' };
const call = { id: 'c1', name: 'record_transaction', input: { amount_cents: 4500, description: 'almoço' } };

beforeEach(() => {
  vi.clearAllMocks();
  db.logToolCall.mockResolvedValue(undefined);
  registry.execute.mockResolvedValue({ id: 'tx-1' });
  registry.getToolByName.mockImplementation((name: string) =>
    name === 'record_transaction'
      ? { name, schema: z.object({ amount_cents: z.number(), description: z.string() }), execute: registry.execute }
      : undefined,
  );
});

describe('runToolCall — turno reexecutado não repete o efeito', () => {
  it('2ª tentativa do MESMO turno (fallback de provider / retry do job): devolve o resultado gravado e NÃO executa de novo', async () => {
    const ledger = new TurnLedger();
    const ctx = { ...baseCtx, turnLedger: ledger };

    ledger.startAttempt(); // Claude
    const first = await runToolCall(call, ctx);
    ledger.startAttempt(); // a chamada seguinte à API falhou; a OpenAI recomeça e pede a mesma tool
    const second = await runToolCall({ ...call, id: 'c2' }, ctx);

    expect(registry.execute).toHaveBeenCalledTimes(1); // um único gasto
    expect(second).toEqual({ id: 'c2', isError: false, content: first.content });
    expect(db.logToolCall).toHaveBeenCalledTimes(1); // o replay não vira uma "chamada nova" no log (o desfazer lê esse log)
  });

  it('dois gastos iguais pedidos de propósito na MESMA tentativa continuam sendo dois', async () => {
    const ctx = { ...baseCtx, turnLedger: new TurnLedger() };
    await runToolCall(call, ctx);
    await runToolCall({ ...call, id: 'c2' }, ctx);
    expect(registry.execute).toHaveBeenCalledTimes(2);
  });

  it('chamada que FALHOU não é gravada: a nova tentativa executa de verdade', async () => {
    registry.execute.mockRejectedValueOnce(new Error('banco fora')).mockResolvedValue({ id: 'tx-1' });
    const ledger = new TurnLedger();
    const ctx = { ...baseCtx, turnLedger: ledger };

    ledger.startAttempt();
    expect((await runToolCall(call, ctx)).isError).toBe(true);
    ledger.startAttempt();
    expect((await runToolCall(call, ctx)).isError).toBe(false);

    expect(registry.execute).toHaveBeenCalledTimes(2);
  });

  it('sem registro de turno (outros chamadores) o comportamento é o de sempre', async () => {
    await runToolCall(call, baseCtx);
    await runToolCall(call, baseCtx);
    expect(registry.execute).toHaveBeenCalledTimes(2);
  });
});

describe('runToolCall — o log nunca transforma ação feita em erro', () => {
  it('logToolCall falhando DEPOIS da tool ter agido: continua sucesso (antes caía no catch e o Tom dizia "falhou", a pessoa repetia e duplicava)', async () => {
    db.logToolCall.mockRejectedValue(new Error('supabase instável'));
    const ledger = new TurnLedger();

    const outcome = await runToolCall(call, { ...baseCtx, turnLedger: ledger });

    expect(outcome).toEqual({ id: 'c1', isError: false, content: JSON.stringify({ id: 'tx-1' }) });
    expect(ledger.size).toBe(1); // e já fica protegido contra repetição
    expect(db.logger.error).toHaveBeenCalledWith('tool_call_log_failed', expect.objectContaining({ toolName: 'record_transaction' }));
  });

  it('falha ao logar um ERRO de tool também não lança', async () => {
    registry.execute.mockRejectedValue(new Error('x'));
    db.logToolCall.mockRejectedValue(new Error('log fora'));
    await expect(runToolCall(call, baseCtx)).resolves.toMatchObject({ isError: true });
  });

  it('tool sem retorno (undefined) não quebra o registro do turno', async () => {
    registry.execute.mockResolvedValue(undefined);
    const ledger = new TurnLedger();
    await expect(runToolCall(call, { ...baseCtx, turnLedger: ledger })).resolves.toMatchObject({ isError: false, content: 'null' });
    expect(ledger.size).toBe(1);
  });
});
