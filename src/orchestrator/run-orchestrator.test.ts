import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, toolCalls } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  toolCalls: [] as { input: unknown; context: unknown }[],
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: mockCreate } };
  }),
}));

vi.mock('./tools/registry', () => ({
  toolDefinitions: [],
  toolHandlers: {
    registrar_transacao: vi.fn(async (input: { shouldThrow?: boolean }, context: unknown) => {
      if (input?.shouldThrow) throw new Error('db down');
      toolCalls.push({ input, context });
      return JSON.stringify({ registrado: true, id: 'tx1' });
    }),
  },
}));

import { runOrchestrator } from './run-orchestrator';

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

function toolUseResponse(name: string, input: unknown, id = 'tooluse_1') {
  return { content: [{ type: 'tool_use', id, name, input }] };
}

describe('runOrchestrator', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    toolCalls.length = 0;
  });

  it('retorna o texto direto quando Claude não pede nenhuma tool', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('Oi! Tudo certo.'));

    const reply = await runOrchestrator('c1', 'oi');

    expect(reply).toBe('Oi! Tudo certo.');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('executa a tool, devolve o resultado, e retorna o texto final do 2º turno', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('registrar_transacao', { tipo: 'gasto', valor: 50, categoria: 'x' }))
      .mockResolvedValueOnce(textResponse('Anotado! 💰'));

    const reply = await runOrchestrator('c1', 'gastei 50 reais');

    expect(reply).toBe('Anotado! 💰');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].context).toEqual({ clientId: 'c1' });

    const secondCallArgs = mockCreate.mock.calls[1][0];
    const lastMessage = secondCallArgs.messages.at(-1);
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content[0].type).toBe('tool_result');
    expect(lastMessage.content[0].tool_use_id).toBe('tooluse_1');
  });

  it('tool desconhecida não quebra o loop (responde erro pra Claude seguir)', async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse('tool_que_nao_existe', {})).mockResolvedValueOnce(textResponse('ok'));

    const reply = await runOrchestrator('c1', 'x');
    expect(reply).toBe('ok');

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content[0].content);
    expect(toolResult).toHaveProperty('erro');
  });

  it('erro dentro do handler não quebra o loop (vira erro genérico no tool_result)', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('registrar_transacao', { shouldThrow: true }))
      .mockResolvedValueOnce(textResponse('tive um problema mas seguimos'));

    const reply = await runOrchestrator('c1', 'x');
    expect(reply).toBe('tive um problema mas seguimos');

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content[0].content);
    expect(toolResult).toHaveProperty('erro');
  });

  it('para depois do limite de turnos se Claude nunca parar de chamar tools', async () => {
    mockCreate.mockResolvedValue(toolUseResponse('registrar_transacao', { tipo: 'gasto', valor: 1, categoria: 'x' }));

    const reply = await runOrchestrator('c1', 'x');

    expect(reply).toMatch(/complexo/);
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });
});
