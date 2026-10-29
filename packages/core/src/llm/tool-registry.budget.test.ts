import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveTools, toAnthropicToolSpecs } from './tool-registry.js';

/**
 * Orçamento do schema de tools (2026-10): o schema inteiro vai em TODA chamada
 * ao LLM (cacheado, mas ainda conta como entrada e pesa na latência). O
 * CLAUDE.md marca ~10 mil tokens como o ponto em que `tool_search`/
 * `defer_loading` passaria a compensar. Este teste é o freio: nova capacidade
 * entra como ação de uma tool existente ou vem com descrições enxutas — nunca
 * como mais uma tool gorda por cima. Medida: caracteres do JSON enviado (≈ tokens × 4).
 */
const CHARS_PER_TOKEN = 4;
const BUDGET_TOKENS_DEFAULT = 7_400; // medido em 2026-10: ~6.9 mil (67 tools, painel e cobrança desligados)
const BUDGET_TOKENS_ALL_FLAGS = 8_200;
const MAX_DESCRIPTION_CHARS = 620;

afterEach(() => vi.unstubAllEnvs());

function specChars(): number {
  return toAnthropicToolSpecs().reduce((sum, spec) => sum + JSON.stringify(spec).length, 0);
}

describe('orçamento do schema de tools', () => {
  it('padrão (painel e cobrança desligados) cabe no orçamento', () => {
    expect(specChars() / CHARS_PER_TOKEN).toBeLessThanOrEqual(BUDGET_TOKENS_DEFAULT);
  });

  it('com tudo ligado ainda cabe, com folga até o patamar de ~10 mil tokens', () => {
    vi.stubEnv('DASHBOARD_ENABLED', 'true');
    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(specChars() / CHARS_PER_TOKEN).toBeLessThanOrEqual(BUDGET_TOKENS_ALL_FLAGS);
  });

  it('nenhuma descrição vira bula', () => {
    vi.stubEnv('DASHBOARD_ENABLED', 'true');
    vi.stubEnv('BILLING_ENABLED', 'true');
    const tooLong = getActiveTools()
      .filter((tool) => tool.description.length > MAX_DESCRIPTION_CHARS)
      .map((tool) => `${tool.name} (${tool.description.length})`);
    // register_plan_intent concentra o fluxo de checkout e é a única exceção conhecida.
    expect(tooLong.filter((entry) => !entry.startsWith('register_plan_intent'))).toEqual([]);
  });
});
