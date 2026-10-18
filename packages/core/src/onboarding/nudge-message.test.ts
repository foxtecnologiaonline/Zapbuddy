import { describe, expect, it } from 'vitest';
import { formatOnboardingNudgeMessage } from './nudge-message.js';

describe('formatOnboardingNudgeMessage', () => {
  it('retorna uma mensagem não vazia pro estágio 2h', () => {
    expect(formatOnboardingNudgeMessage('2h').length).toBeGreaterThan(0);
  });

  it('retorna uma mensagem não vazia pro estágio 24h', () => {
    expect(formatOnboardingNudgeMessage('24h').length).toBeGreaterThan(0);
  });

  it('varia a mensagem em chamadas repetidas (não é sempre a mesma frase)', () => {
    const results = new Set(Array.from({ length: 30 }, () => formatOnboardingNudgeMessage('2h')));
    expect(results.size).toBeGreaterThan(1);
  });
});
