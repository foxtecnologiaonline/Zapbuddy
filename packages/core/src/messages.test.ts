import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';

describe('MESSAGES.reminder', () => {
  it('sempre inclui o texto do lembrete, em qualquer variação sorteada', () => {
    for (let i = 0; i < 20; i++) {
      expect(MESSAGES.reminder('pagar o aluguel')).toContain('pagar o aluguel');
    }
  });

  it('varia entre mais de uma frase (não é sempre a mesma estrutura)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(MESSAGES.reminder('teste'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
