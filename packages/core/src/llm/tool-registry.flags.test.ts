import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveTools, getToolByName, toAnthropicToolSpecs, toOpenAiToolSpecs } from './tool-registry.js';

const names = () => getActiveTools().map((tool) => tool.name);
afterEach(() => vi.unstubAllEnvs());

describe('tools inibidas (painel e cobrança desligados — padrão)', () => {
  it('o modelo não vê send_dashboard_login_link nem register_plan_intent', () => {
    expect(names()).not.toContain('send_dashboard_login_link');
    expect(names()).not.toContain('register_plan_intent');
    expect(toAnthropicToolSpecs().map((tool) => tool.name)).not.toContain('register_plan_intent');
    expect(toOpenAiToolSpecs().map((tool) => (tool as { function: { name: string } }).function.name)).not.toContain('send_dashboard_login_link');
  });

  it('e mesmo que peça pelo nome, não é executável', () => {
    expect(getToolByName('send_dashboard_login_link')).toBeUndefined();
    expect(getToolByName('register_plan_intent')).toBeUndefined();
  });

  it('o resto continua disponível', () => {
    expect(names()).toEqual(expect.arrayContaining(['record_transaction', 'create_task', 'complete_onboarding', 'tell_joke']));
  });
});

describe('tools religadas', () => {
  it('cada interruptor devolve só as suas tools', () => {
    vi.stubEnv('DASHBOARD_ENABLED', 'true');
    expect(names()).toContain('send_dashboard_login_link');
    expect(names()).not.toContain('register_plan_intent');

    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(names()).toContain('register_plan_intent');
    expect(getToolByName('register_plan_intent')).toBeDefined();
  });
});
