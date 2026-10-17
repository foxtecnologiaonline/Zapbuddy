import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@zapbuddy/db';

/**
 * Teste de comportamento do orquestrador — até agora só havia verificação
 * estática (typecheck) dessas mudanças, nunca uma execução real. Mocka a
 * SDK da Anthropic, o contexto de conversa (Redis) e o canal de WhatsApp,
 * mas usa o tool-registry REAL (sem invocar tools de verdade — os cenários
 * abaixo sempre usam um nome de tool inexistente, que cai no branch "tool
 * desconhecida" sem precisar de Supabase/Redis reais). logToolCall é
 * sobrescrito porque ele bate direto no Supabase (sem credenciais aqui).
 */
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  // `function` (não arrow) de propósito: orchestrator.ts chama `new
  // Anthropic(...)`, e só uma function declaration pode ser invocada com
  // `new` — uma arrow function quebra com "is not a constructor".
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: mockCreate } };
  }),
}));

vi.mock('@zapbuddy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zapbuddy/db')>();
  return { ...actual, logToolCall: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../context/conversation-context.js', () => ({
  appendTurn: vi.fn().mockResolvedValue(undefined),
  getRecentTurns: vi.fn().mockResolvedValue([]),
}));

vi.mock('../whatsapp/channel.js', () => ({
  sendWhatsappTextMessage: vi.fn().mockResolvedValue(undefined),
}));

import { appendTurn } from '../context/conversation-context.js';
import { sendWhatsappTextMessage } from '../whatsapp/channel.js';
import { MESSAGES } from '../messages.js';
import { INTERIM_NOTICE_MS, orchestrateTurn } from './orchestrator.js';

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    whatsapp_number: '5511999999999',
    name: 'Marina',
    timezone: 'America/Sao_Paulo',
    onboarding_completed_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockCreate.mockReset();
  vi.mocked(appendTurn).mockClear();
  vi.mocked(sendWhatsappTextMessage).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('orchestrateTurn', () => {
  it('retorna o texto final e salva o mesmo texto no contexto de conversa', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Beleza, anotado!' }],
      stop_reason: 'end_turn',
    });

    const result = await orchestrateTurn({
      user: baseUser(),
      messageText: 'gastei 30 no mercado',
      messageSource: 'text',
    });

    expect(result.replyText).toBe('Beleza, anotado!');
    expect(appendTurn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(appendTurn).mock.calls[1]?.[1]).toMatchObject({
      role: 'assistant',
      content: 'Beleza, anotado!',
    });
    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('quando o loop esgota as iterações e o wrap-up não traz texto, usa e persiste o fallback (não string vazia)', async () => {
    // Toda chamada com `tools` no payload é uma iteração do loop principal —
    // sempre devolve tool_use (nunca acaba sozinho, força esgotar
    // MAX_TOOL_ITERATIONS). A chamada de wrap-up (sem `tools`) devolve sem
    // nenhum bloco de texto, simulando o caso em que mesmo o resumo final
    // não gera texto.
    mockCreate.mockImplementation((params: { tools?: unknown }) => {
      if (params.tools) {
        return Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-1', name: 'tool_que_nao_existe', input: {} }],
          stop_reason: 'tool_use',
        });
      }
      return Promise.resolve({ content: [], stop_reason: 'end_turn' });
    });

    const result = await orchestrateTurn({
      user: baseUser(),
      messageText: 'oi',
      messageSource: 'text',
    });

    expect(result.replyText).toBe(MESSAGES.noReplyGenerated);
    // 6 iterações (sempre tool_use) + 1 chamada de wrap-up sem tools.
    expect(mockCreate).toHaveBeenCalledTimes(7);
    const assistantTurn = vi.mocked(appendTurn).mock.calls[1]?.[1];
    expect(assistantTurn?.content).toBe(MESSAGES.noReplyGenerated);
    expect(assistantTurn?.content).not.toBe('');
  });

  it('dispara um único aviso de "ainda to vendo isso" quando o turno passa do timeout, sem abortar o processamento', async () => {
    vi.useFakeTimers();

    let resolveFirstCall!: (value: unknown) => void;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstCall = resolve;
        }),
    );

    const turnPromise = orchestrateTurn({
      user: baseUser(),
      messageText: 'resumo da semana',
      messageSource: 'text',
    });

    await vi.advanceTimersByTimeAsync(INTERIM_NOTICE_MS + 50);

    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    expect(sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', MESSAGES.stillProcessing);

    resolveFirstCall({
      content: [{ type: 'text', text: 'Aqui está seu resumo.' }],
      stop_reason: 'end_turn',
    });

    const result = await turnPromise;

    expect(result.replyText).toBe('Aqui está seu resumo.');
    // Não dispara de novo depois que o turno real já respondeu.
    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
  });

  it('não dispara aviso quando o turno termina antes do timeout', async () => {
    vi.useFakeTimers();

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Rápido.' }],
      stop_reason: 'end_turn',
    });

    const turnPromise = orchestrateTurn({
      user: baseUser(),
      messageText: 'oi',
      messageSource: 'text',
    });
    await vi.advanceTimersByTimeAsync(0);
    const result = await turnPromise;

    await vi.advanceTimersByTimeAsync(INTERIM_NOTICE_MS + 50);

    expect(result.replyText).toBe('Rápido.');
    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
  });
});
