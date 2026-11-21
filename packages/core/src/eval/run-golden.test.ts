import { afterEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { buildAnthropicRequestParts, resolveAnthropicModel } from '../llm/providers/anthropic-provider.js';
import { buildSystemPromptBlocks } from '../llm/system-prompt.js';
import { GOLDEN_CASES } from './golden-set.js';
import type { GoldenCase } from './golden-eval.js';
import { EVAL_TIMEZONE, buildCaseRequest, createAnthropicCaller, evalUser, runGoldenSet, type MessagesClient } from './run-golden.js';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const byId = (id: string): GoldenCase => GOLDEN_CASES.find((c) => c.id === id)!;

afterEach(() => {
  delete process.env.ANTHROPIC_MODEL;
});

describe('buildCaseRequest — a requisição é a da produção', () => {
  it('usa o mesmo modelo, limite, effort e as mesmas camadas de cache do provider real', () => {
    const request = buildCaseRequest(byId('fin-001'), NOW);

    expect(request.model).toBe(resolveAnthropicModel());
    expect(request.max_tokens).toBe(1024);
    expect(request.output_config).toEqual({ effort: 'low' });
    expect(request.messages).toEqual([{ role: 'user', content: 'gastei 35 no almoço' }]);

    // Mesma montagem do provider: cache_control no último tool e no stable do system.
    const tools = request.tools as Anthropic.Tool[];
    expect(tools.length).toBeGreaterThan(40);
    expect((tools.at(-1) as { cache_control?: unknown }).cache_control).toEqual({ type: 'ephemeral' });
    const system = request.system as Anthropic.TextBlockParam[];
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(system.at(-1)!.cache_control).toBeUndefined(); // camada volátil (hora) nunca é cacheada

    const expected = buildAnthropicRequestParts(buildSystemPromptBlocks(evalUser(NOW), [], null, []));
    expect(tools.map((t) => t.name)).toEqual(expected.tools.map((t) => t.name));
  });

  it('respeita ANTHROPIC_MODEL, como a produção', () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
    expect(buildCaseRequest(byId('fin-001'), NOW).model).toBe('claude-sonnet-5-5');
  });

  it('manda o histórico antes da mensagem', () => {
    const request = buildCaseRequest(byId('lem-007'), NOW);
    expect(request.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'amanhã às 10h' });
  });

  it('entrega o id do fato no prompt (é o que torna forget_fact alcançável), e só nos casos que têm fatos', () => {
    const withFact = buildCaseRequest(byId('mem-002'), NOW);
    const text = (withFact.system as Anthropic.TextBlockParam[]).map((block) => block.text).join('\n');
    expect(text).toContain('- [3f1c2b9e-0000-4000-8000-0000000000aa] mora em Curitiba');

    const without = (buildCaseRequest(byId('fin-001'), NOW).system as Anthropic.TextBlockParam[]).map((block) => block.text).join('\n');
    expect(without).not.toContain('3f1c2b9e');
  });

  it('a pessoa do eval está no estado padrão do produto: fuso de Brasília, onboarding feito, sem teste/cobrança', () => {
    const user = evalUser(NOW);
    expect(user.timezone).toBe(EVAL_TIMEZONE);
    expect(user.onboarding_completed_at).not.toBeNull();
    expect(user.plan_status).toBe('active');
  });
});

function fakeClient(content: Anthropic.ContentBlock[]): MessagesClient & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({ content });
  return { messages: { create }, create } as unknown as MessagesClient & { create: ReturnType<typeof vi.fn> };
}

describe('createAnthropicCaller', () => {
  it('extrai as tool calls (nome e argumentos) e o texto da resposta', async () => {
    const client = fakeClient([
      { type: 'text', text: 'Anotado!' },
      { type: 'tool_use', id: 't1', name: 'record_transaction', input: { amount_cents: 3500 } },
      { type: 'tool_use', id: 't2', name: 'list_tasks', input: {} },
    ] as Anthropic.ContentBlock[]);

    const outcome = await createAnthropicCaller(client)(byId('fin-001'), NOW);

    expect(outcome.text).toBe('Anotado!');
    expect(outcome.toolCalls).toEqual([
      { name: 'record_transaction', args: { amount_cents: 3500 } },
      { name: 'list_tasks', args: {} },
    ]);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('resposta só de texto = nenhuma tool', async () => {
    const outcome = await createAnthropicCaller(fakeClient([{ type: 'text', text: 'Oi!' }] as Anthropic.ContentBlock[]))(byId('cnv-001'), NOW);
    expect(outcome.toolCalls).toEqual([]);
  });
});

describe('runGoldenSet', () => {
  const two = [byId('fin-001'), byId('cnv-001')];

  it('roda cada caso N vezes e avalia contra o que o modelo respondeu', async () => {
    const callModel = vi.fn(async (c: GoldenCase) =>
      c.id === 'fin-001' ? { toolCalls: [{ name: 'record_transaction', args: { type: 'expense', amount_cents: 3500, category: 'alimentacao' } }], text: '' } : { toolCalls: [], text: 'oi' },
    );

    const { report, apiErrors, summaries } = await runGoldenSet({ cases: two, callModel, runs: 3 });

    expect(callModel).toHaveBeenCalledTimes(6);
    expect(apiErrors).toBe(0);
    expect(report).toMatchObject({ total: 2, passed: 2 });
    expect(summaries.every((s) => s.runs === 3 && !s.flaky)).toBe(true);
  });

  it('erro de API não derruba a execução: vira falha do caso e é contado à parte (resultado inconclusivo)', async () => {
    const callModel = vi.fn(async (c: GoldenCase) => {
      if (c.id === 'fin-001') throw new Error('529 overloaded');
      return { toolCalls: [], text: 'oi' };
    });

    const { report, apiErrors, summaries } = await runGoldenSet({ cases: two, callModel });

    expect(apiErrors).toBe(1);
    expect(report.passed).toBe(1);
    expect(summaries.find((s) => s.id === 'fin-001')!.failures[0]).toMatch(/erro ao chamar o modelo: 529 overloaded/);
  });

  it('nunca passa da concorrência pedida', async () => {
    let inFlight = 0;
    let peak = 0;
    const callModel = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { toolCalls: [], text: '' };
    });

    await runGoldenSet({ cases: GOLDEN_CASES.slice(0, 12), callModel, concurrency: 3 });

    expect(callModel).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('captura a hora ANTES de cada chamada e avalia a data relativa contra ela', async () => {
    const clock = vi.fn(() => NOW);
    const callModel = vi.fn(async () => ({
      // amanhã 17h em Brasília
      toolCalls: [{ name: 'create_task', args: { title: 'Entregar o relatório', due_at: '2026-11-22T20:00:00.000Z' } }],
      text: '',
    }));

    const { report } = await runGoldenSet({ cases: [byId('tar-006')], callModel, clock });

    expect(clock).toHaveBeenCalledTimes(1);
    expect(report.passed).toBe(1);
  });

  it('conjunto vazio: relatório sem divisão por zero', async () => {
    const { report } = await runGoldenSet({ cases: [], callModel: vi.fn() });
    expect(report.total).toBe(0);
    expect(report.passRate).toBeNull();
  });
});
