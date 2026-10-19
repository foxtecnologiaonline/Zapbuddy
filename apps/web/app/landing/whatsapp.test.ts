import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, normalizeWhatsAppNumber } from './whatsapp';

describe('normalizeWhatsAppNumber', () => {
  it('mantém só os dígitos de um número formatado', () => {
    expect(normalizeWhatsAppNumber('+55 (11) 99999-9999')).toBe('5511999999999');
  });

  it('devolve null quando não há número', () => {
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
    expect(normalizeWhatsAppNumber('')).toBeNull();
  });

  it('rejeita número curto demais ou longo demais', () => {
    expect(normalizeWhatsAppNumber('12345')).toBeNull();
    expect(normalizeWhatsAppNumber('1234567890123456')).toBeNull();
  });
});

describe('buildWhatsAppLink', () => {
  it('monta wa.me com a mensagem pré-preenchida codificada', () => {
    expect(buildWhatsAppLink('+55 11 99999-9999', 'Oi, Tom!')).toBe(
      'https://wa.me/5511999999999?text=Oi%2C%20Tom!',
    );
  });

  it('devolve null sem número válido, pra não gerar link quebrado', () => {
    expect(buildWhatsAppLink(undefined, 'Oi, Tom!')).toBeNull();
    expect(buildWhatsAppLink('abc', 'Oi, Tom!')).toBeNull();
  });
});
