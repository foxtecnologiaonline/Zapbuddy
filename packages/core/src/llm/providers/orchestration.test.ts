import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider, LlmProviderRunInput } from './types.js';

/**
 * runLlmWithFallback agora é o lugar certo pro aviso de turno lento (cobre
 * a tentativa inteira, incluindo troca pro fallback) — antes vivia dentro
 * do loop específico do Anthropic em orchestrator.ts. Mocka só o canal de
 * WhatsApp; os "providers" aqui são objetos falsos que implementam
 * LlmProvider direto, sem precisar simular a SDK de nenhum vendor.
 */
vi.mock('@zapbuddy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zapbuddy/db')>();
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

vi.mock('../../whatsapp/channel.js', () => ({
  sendWhatsappTextMessage: vi.fn().mockResolvedValue(undefined),
}));

import { sendWhatsappTextMessage } from '../../whatsapp/channel.js';
import { MESSAGES } from '../../messages.js';
import { LLM_PROVIDERS_BY_PRIORITY } from './config.js';
import { INTERIM_NOTICE_MS, runLlmWithFallback } from './orchestration.js';

function fakeProvider(name: string, run: LlmProvider['run']): LlmProvider {
  return { name, isConfigured: () => true, run };
}

const baseInput: Omit<LlmProviderRunInput, 'toolContext'> & { toolContext: LlmProviderRunInput['toolContext'] } = {
  system: 'system prompt',
  history: [],
  userMessage: 'oi',
  toolContext: {
    userId: 'user-1',
    whatsappNumber: '5511999999999',
    messageSource: 'text',
    timezone: 'America/Sao_Paulo',
    accountId: 'account-1',
    role: 'owner',
  },
};

beforeEach(() => {
  vi.mocked(sendWhatsappTextMessage).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  LLM_PROVIDERS_BY_PRIORITY.length = 0;
  LLM_PROVIDERS_BY_PRIORITY.push(...originalProviders);
});

// LLM_PROVIDERS_BY_PRIORITY é um array real do módulo config.js — salva e
// restaura pra não deixar um fake provider de um teste vazar pro próximo.
const originalProviders = [...LLM_PROVIDERS_BY_PRIORITY];

describe('runLlmWithFallback', () => {
  it('dispara um único aviso de "ainda to vendo isso" quando a tentativa passa do timeout', async () => {
    vi.useFakeTimers();

    let resolveRun!: (value: { replyText: string }) => void;
    LLM_PROVIDERS_BY_PRIORITY.length = 0;
    LLM_PROVIDERS_BY_PRIORITY.push(
      fakeProvider(
        'lento',
        () =>
          new Promise((resolve) => {
            resolveRun = resolve;
          }),
      ),
    );

    const runPromise = runLlmWithFallback(baseInput);

    await vi.advanceTimersByTimeAsync(INTERIM_NOTICE_MS + 50);

    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    expect(sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', MESSAGES.stillProcessing);

    resolveRun({ replyText: 'pronto' });
    const result = await runPromise;

    expect(result.replyText).toBe('pronto');
    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
  });

  it('não dispara aviso quando a tentativa termina antes do timeout', async () => {
    vi.useFakeTimers();

    LLM_PROVIDERS_BY_PRIORITY.length = 0;
    LLM_PROVIDERS_BY_PRIORITY.push(fakeProvider('rapido', async () => ({ replyText: 'rápido' })));

    const runPromise = runLlmWithFallback(baseInput);
    await vi.advanceTimersByTimeAsync(0);
    const result = await runPromise;
    await vi.advanceTimersByTimeAsync(INTERIM_NOTICE_MS + 50);

    expect(result.replyText).toBe('rápido');
    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('cai pro próximo provider configurado quando o primeiro falha, sem disparar aviso extra', async () => {
    LLM_PROVIDERS_BY_PRIORITY.length = 0;
    LLM_PROVIDERS_BY_PRIORITY.push(
      fakeProvider('primario', async () => {
        throw new Error('créditos esgotados');
      }),
      fakeProvider('fallback', async () => ({ replyText: 'resposta do fallback' })),
    );

    const result = await runLlmWithFallback(baseInput);

    expect(result.replyText).toBe('resposta do fallback');
    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('propaga o erro quando todos os providers configurados falham', async () => {
    LLM_PROVIDERS_BY_PRIORITY.length = 0;
    LLM_PROVIDERS_BY_PRIORITY.push(
      fakeProvider('primario', async () => {
        throw new Error('falhou 1');
      }),
      fakeProvider('fallback', async () => {
        throw new Error('falhou 2');
      }),
    );

    await expect(runLlmWithFallback(baseInput)).rejects.toThrow('falhou 2');
  });
});
