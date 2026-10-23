import { describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({}));

import { ALL_TOOLS, toAnthropicToolSpecs, toOpenAiToolSpecs } from './tool-registry.js';

describe('registro de tools', () => {
  it('nomes únicos e válidos para os dois providers', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
  });

  it('todo input_schema tem raiz "object" (refine/default/nullable não quebram a conversão)', () => {
    for (const spec of toAnthropicToolSpecs()) {
      expect((spec.input_schema as { type?: string }).type, spec.name).toBe('object');
    }
    for (const spec of toOpenAiToolSpecs()) {
      if (spec.type !== 'function') continue;
      expect((spec.function.parameters as { type?: string }).type, spec.function.name).toBe('object');
    }
  });

  it('schema serializado fica abaixo do patamar onde defer_loading passa a compensar (~10K tokens, chars/4)', () => {
    const estimatedTokens = JSON.stringify(toAnthropicToolSpecs()).length / 4;
    expect(estimatedTokens).toBeLessThan(10_000);
  });
});
