import { describe, expect, it } from 'vitest';
import { mergeHybridResults } from './hybrid.js';

describe('mergeHybridResults', () => {
  it('exatos primeiro, relacionados depois, sem repetir id', () => {
    const merged = mergeHybridResults([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }], 10);
    expect(merged).toEqual([
      { item: { id: 'a' }, match: 'exact' },
      { item: { id: 'b' }, match: 'exact' },
      { item: { id: 'c' }, match: 'related' },
    ]);
  });

  it('respeita o limite mantendo os exatos na frente', () => {
    const merged = mergeHybridResults([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }], 2);
    expect(merged.map((entry) => entry.item.id)).toEqual(['a', 'b']);
  });

  it('sem exatos, devolve só os relacionados', () => {
    expect(mergeHybridResults([], [{ id: 'x' }], 5)).toEqual([{ item: { id: 'x' }, match: 'related' }]);
  });
});
