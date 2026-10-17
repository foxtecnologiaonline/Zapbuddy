import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../tool-types.js';

/**
 * Cobertura de comportamento do provider Anthropic — loop de tool-use,
 * execução em paralelo, e o fallback de texto quando o wrap-up não traz
 * nada (MESSAGES.noReplyGenerated, nunca string vazia). Essa lógica morava
 * em orchestrator.ts antes da refatoração multi-provider; os cenários
 * abaixo são os mesmos, só apontando pro novo lugar.
 */
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  // `function` (não arrow): o provider chama `new Anthropic(...)`, e só uma
  // function declaration pode ser invocada com `new`.
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: mockCreate } };
  }),
}));

vi.mock('@zapbuddy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zapbuddy/db')>();
  return { ...actual, logToolCall: vi.fn().mockResolvedValue(undefined) };
});

import { anthropicProvider } from './anthropic-provider.js';
import { MESSAGES } from '../../messages.js';

const toolContext: ToolContext = {
  userId: 'user-1',
  whatsappNumber: '5511999999999',
  messageSource: 'text',
  timezone: 'America/Sao_Paulo',
  accountId: 'account-1',
  role: 'owner',
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockCreate.mockReset();
});

describe('anthropicProvider.run', () => {
  it('retorna o texto final quando não há tool use', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Beleza, anotado!' }],
      stop_reason: 'end_turn',
    });

    const result = await anthropicProvider.run({
      system: 'system prompt',
      history: [],
      userMessage: 'gastei 30 no mercado',
      toolContext,
    });

    expect(result.replyText).toBe('Beleza, anotado!');
  });

  it('quando o loop esgota as iterações e o wrap-up não traz texto, usa o fallback (não string vazia)', async () => {
    // Toda chamada com `tools` no payload é uma iteração do loop principal —
    // sempre devolve tool_use (nunca acaba sozinho, força esgotar as 6
    // iterações). A chamada de wrap-up (sem `tools`) devolve sem nenhum
    // bloco de texto, simulando o caso em que mesmo o resumo final falha.
    mockCreate.mockImplementation((params: { tools?: unknown }) => {
      if (params.tools) {
        return Promise.resolve({
          content: [{ type: 'tool_use', id: 'tool-1', name: 'tool_que_nao_existe', input: {} }],
          stop_reason: 'tool_use',
        });
      }
      return Promise.resolve({ content: [], stop_reason: 'end_turn' });
    });

    const result = await anthropicProvider.run({
      system: 'system prompt',
      history: [],
      userMessage: 'oi',
      toolContext,
    });

    expect(result.replyText).toBe(MESSAGES.noReplyGenerated);
    // 6 iterações (sempre tool_use) + 1 chamada de wrap-up sem tools.
    expect(mockCreate).toHaveBeenCalledTimes(7);
  });
});
