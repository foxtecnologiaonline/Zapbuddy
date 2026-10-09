import { describe, expect, it } from 'vitest';
import { normalizeCategory, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './categories.js';

describe('normalizeCategory', () => {
  it('aceita categorias conhecidas de despesa sem alterar', () => {
    for (const category of EXPENSE_CATEGORIES) {
      expect(normalizeCategory(category)).toBe(category);
    }
  });

  it('aceita categorias conhecidas de receita sem alterar', () => {
    for (const category of INCOME_CATEGORIES) {
      expect(normalizeCategory(category)).toBe(category);
    }
  });

  it('normaliza maiúsculas/espaços pra uma categoria conhecida', () => {
    expect(normalizeCategory('  Alimentacao  ')).toBe('alimentacao');
    expect(normalizeCategory('SAUDE')).toBe('saude');
  });

  it('remove acentos — "saúde"/"educação" não podem cair em outros', () => {
    expect(normalizeCategory('saúde')).toBe('saude');
    expect(normalizeCategory('Educação')).toBe('educacao');
  });

  it('cai em "outros" pra categoria desconhecida — nunca lança erro', () => {
    expect(normalizeCategory('categoria-que-nao-existe')).toBe('outros');
    expect(normalizeCategory('')).toBe('outros');
    expect(normalizeCategory('presente de aniversário')).toBe('outros');
  });
});
