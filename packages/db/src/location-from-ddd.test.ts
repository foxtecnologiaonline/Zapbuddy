import { describe, expect, it } from 'vitest';
import { inferLocationFromWhatsappNumber } from './location-from-ddd.js';

describe('inferLocationFromWhatsappNumber', () => {
  it('reconhece DDD de São Paulo (padrão) com 9 dígitos de linha', () => {
    expect(inferLocationFromWhatsappNumber('5511999999999')).toEqual({
      city: 'São Paulo',
      uf: 'SP',
      latitude: -23.5505,
      longitude: -46.6333,
    });
  });

  it('infere Manaus (Amazonas, DDD 92) e Fortaleza (Ceará, DDD 85)', () => {
    expect(inferLocationFromWhatsappNumber('5592999999999').uf).toBe('AM');
    expect(inferLocationFromWhatsappNumber('5585999999999').uf).toBe('CE');
  });

  it('infere Porto Alegre (Rio Grande do Sul, DDD 51) com 8 dígitos de linha', () => {
    expect(inferLocationFromWhatsappNumber('555199999999').uf).toBe('RS');
  });

  it('cai no default (São Paulo) pra número que não é brasileiro', () => {
    expect(inferLocationFromWhatsappNumber('12025550123')).toEqual({
      city: 'São Paulo',
      uf: 'SP',
      latitude: -23.5505,
      longitude: -46.6333,
    });
  });

  it('cai no default pra número com tamanho fora do esperado', () => {
    expect(inferLocationFromWhatsappNumber('5511').uf).toBe('SP');
  });

  it('cai no default pra DDD desconhecido/não mapeado', () => {
    expect(inferLocationFromWhatsappNumber('5500999999999').uf).toBe('SP');
  });
});
