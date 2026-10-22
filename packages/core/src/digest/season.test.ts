import { describe, expect, it } from 'vitest';
import { estacaoDoAno } from './season.js';

describe('estacaoDoAno', () => {
  it('verão: inclui virada de ano e começo de março', () => {
    expect(estacaoDoAno(12, 25)).toBe('verão');
    expect(estacaoDoAno(1, 15)).toBe('verão');
    expect(estacaoDoAno(3, 20)).toBe('verão');
  });

  it('outono', () => {
    expect(estacaoDoAno(3, 21)).toBe('outono');
    expect(estacaoDoAno(5, 10)).toBe('outono');
    expect(estacaoDoAno(6, 20)).toBe('outono');
  });

  it('inverno', () => {
    expect(estacaoDoAno(6, 21)).toBe('inverno');
    expect(estacaoDoAno(8, 1)).toBe('inverno');
    expect(estacaoDoAno(9, 22)).toBe('inverno');
  });

  it('primavera', () => {
    expect(estacaoDoAno(9, 23)).toBe('primavera');
    expect(estacaoDoAno(10, 22)).toBe('primavera');
    expect(estacaoDoAno(12, 20)).toBe('primavera');
  });
});
