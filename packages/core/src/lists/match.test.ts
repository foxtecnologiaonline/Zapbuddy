import { describe, expect, it } from 'vitest';
import { cleanItemText, matchItem, normalizeText } from './match.js';

const items = [
  { id: '1', text: 'Ovos caipiras' },
  { id: '2', text: 'Leite integral' },
  { id: '3', text: 'Leite de coco' },
  { id: '4', text: 'Pão' },
];

describe('normalizeText', () => {
  it('sem acento, caixa nem plural simples', () => {
    expect(normalizeText('  PÃO  ')).toBe('pao');
    expect(normalizeText('Ovos')).toBe('ovo');
    expect(normalizeText('Limões')).toBe(normalizeText('limões'));
  });
});

describe('matchItem', () => {
  it('acha por trecho, plural e acento', () => {
    expect(matchItem(items, 'ovo')).toEqual({ kind: 'one', item: items[0] });
    expect(matchItem(items, 'pao')).toEqual({ kind: 'one', item: items[3] });
  });

  it('ambíguo devolve as opções em vez de chutar', () => {
    const result = matchItem(items, 'leite');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates.map((c) => c.id)).toEqual(['2', '3']);
  });

  it('igualdade exata vence o parcial', () => {
    const result = matchItem([{ id: 'a', text: 'Leite' }, { id: 'b', text: 'Leite de coco' }], 'leite');
    expect(result).toEqual({ kind: 'one', item: { id: 'a', text: 'Leite' } });
  });

  it('nada encontrado', () => {
    expect(matchItem(items, 'sorvete')).toEqual({ kind: 'none' });
    expect(matchItem(items, '   ')).toEqual({ kind: 'none' });
  });

  it('limpa o texto do item', () => {
    expect(cleanItemText('  pão   de   queijo ')).toBe('pão de queijo');
  });
});
