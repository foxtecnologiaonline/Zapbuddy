import { describe, expect, it } from 'vitest';
import { assignOnboardingVariant } from './onboarding-variant.js';

describe('assignOnboardingVariant', () => {
  it('atribui ask_name_first pra número terminado em dígito par', () => {
    expect(assignOnboardingVariant('5511999999998')).toBe('ask_name_first');
  });

  it('atribui ask_action_first pra número terminado em dígito ímpar', () => {
    expect(assignOnboardingVariant('5511999999999')).toBe('ask_action_first');
  });

  it('é determinístico — mesmo número sempre cai na mesma variante', () => {
    const a = assignOnboardingVariant('5521988887777');
    const b = assignOnboardingVariant('5521988887777');
    expect(a).toBe(b);
  });
});
