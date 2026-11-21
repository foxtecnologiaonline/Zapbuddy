import { describe, expect, it } from 'vitest';
import { inferTimezoneFromUf, inferTimezoneFromWhatsappNumber } from './timezone-from-ddd.js';

describe('inferTimezoneFromWhatsappNumber', () => {
  it('reconhece DDD de São Paulo (padrão) com 9 dígitos de linha', () => {
    expect(inferTimezoneFromWhatsappNumber('5511999999999')).toBe('America/Sao_Paulo');
  });

  it('reconhece DDD de São Paulo com 8 dígitos de linha (número antigo)', () => {
    expect(inferTimezoneFromWhatsappNumber('551199999999')).toBe('America/Sao_Paulo');
  });

  it('infere Manaus (Amazonas, DDD 92)', () => {
    expect(inferTimezoneFromWhatsappNumber('5592999999999')).toBe('America/Manaus');
  });

  it('infere Rio Branco (Acre, DDD 68)', () => {
    expect(inferTimezoneFromWhatsappNumber('5568999999999')).toBe('America/Rio_Branco');
  });

  it('infere Campo Grande (Mato Grosso do Sul, DDD 67)', () => {
    expect(inferTimezoneFromWhatsappNumber('5567999999999')).toBe('America/Campo_Grande');
  });

  it('infere Cuiabá (Mato Grosso, DDD 65 e 66)', () => {
    expect(inferTimezoneFromWhatsappNumber('5565999999999')).toBe('America/Cuiaba');
    expect(inferTimezoneFromWhatsappNumber('5566999999999')).toBe('America/Cuiaba');
  });

  it('infere Porto Velho (Rondônia, DDD 69) e Boa Vista (Roraima, DDD 95)', () => {
    expect(inferTimezoneFromWhatsappNumber('5569999999999')).toBe('America/Porto_Velho');
    expect(inferTimezoneFromWhatsappNumber('5595999999999')).toBe('America/Boa_Vista');
  });

  it('cai no default pra número que não é brasileiro (DDI diferente de 55)', () => {
    expect(inferTimezoneFromWhatsappNumber('12025550123')).toBe('America/Sao_Paulo');
  });

  it('cai no default pra número com tamanho fora do esperado pra um número brasileiro', () => {
    expect(inferTimezoneFromWhatsappNumber('5511')).toBe('America/Sao_Paulo');
  });
});

describe('inferTimezoneFromUf', () => {
  it('estados com fuso próprio', () => {
    expect(inferTimezoneFromUf('AC')).toBe('America/Rio_Branco');
    expect(inferTimezoneFromUf('AM')).toBe('America/Manaus');
    expect(inferTimezoneFromUf('MT')).toBe('America/Cuiaba');
    expect(inferTimezoneFromUf('MS')).toBe('America/Campo_Grande');
    expect(inferTimezoneFromUf('RO')).toBe('America/Porto_Velho');
    expect(inferTimezoneFromUf('RR')).toBe('America/Boa_Vista');
  });

  it('o resto do Brasil fica em Brasília, inclusive PA, TO, BA e DF', () => {
    for (const uf of ['SP', 'RJ', 'MG', 'DF', 'BA', 'PA', 'TO', 'RS', 'PE']) {
      expect(inferTimezoneFromUf(uf)).toBe('America/Sao_Paulo');
    }
  });

  it('aceita minúscula e espaço; valor estranho cai no padrão (nunca lança)', () => {
    expect(inferTimezoneFromUf(' am ')).toBe('America/Manaus');
    expect(inferTimezoneFromUf('')).toBe('America/Sao_Paulo');
    expect(inferTimezoneFromUf('XX')).toBe('America/Sao_Paulo');
  });
});
