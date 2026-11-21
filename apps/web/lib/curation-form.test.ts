import { describe, expect, it } from 'vitest';
import { OUTCOME_OPTIONS, outcomeValue, parseOutcome, safeBackPath } from './curation-form';

describe('curation-form', () => {
  it('parseOutcome separa veredito e destino', () => {
    expect(parseOutcome('acertou')).toEqual({ verdict: 'acertou', destination: null });
    expect(parseOutcome('errou:categoria')).toEqual({ verdict: 'errou', destination: 'categoria' });
    expect(parseOutcome('')).toEqual({ verdict: '', destination: null });
  });

  it('todas as opções do select são entendidas pelo parseOutcome e voltam iguais via outcomeValue', () => {
    expect(OUTCOME_OPTIONS.map((o) => o.value)).toEqual(['acertou', 'ruido', 'errou:prompt', 'errou:categoria', 'errou:bug', 'errou:exemplo']);
    for (const option of OUTCOME_OPTIONS) {
      const { verdict, destination } = parseOutcome(option.value);
      expect(outcomeValue({ verdict, destination })).toBe(option.value);
    }
  });

  it('safeBackPath só aceita a própria curadoria (sem open redirect)', () => {
    expect(safeBackPath('/admin/curadoria')).toBe('/admin/curadoria');
    expect(safeBackPath('/admin/curadoria?status=revisados&sinal=failed')).toBe('/admin/curadoria?status=revisados&sinal=failed');
    for (const bad of ['https://evil.com', '//evil.com', '/admin/contacts', '/admin/curadoria/../login', '/admin/curadoriaX', '/admin/curadoria?x=<script>', null, 42]) {
      expect(safeBackPath(bad)).toBe('/admin/curadoria');
    }
  });
});
