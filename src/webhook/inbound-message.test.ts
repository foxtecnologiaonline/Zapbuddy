import { describe, it, expect } from 'vitest';
import { normalizeWhatsAppId, InvalidPhoneNumberError } from './inbound-message';

describe('normalizeWhatsAppId', () => {
  it('normaliza número com DDI e DDD removendo não-dígitos', () => {
    expect(normalizeWhatsAppId('+55 11 99999-9999')).toBe('5511999999999');
  });

  it('rejeita número muito curto', () => {
    expect(() => normalizeWhatsAppId('12345')).toThrow(InvalidPhoneNumberError);
  });

  it('rejeita string vazia/sem dígitos', () => {
    expect(() => normalizeWhatsAppId('abc')).toThrow(InvalidPhoneNumberError);
  });

  it('rejeita número absurdamente longo', () => {
    expect(() => normalizeWhatsAppId('1'.repeat(20))).toThrow(InvalidPhoneNumberError);
  });

  it('aceita número no limite mínimo (10 dígitos)', () => {
    expect(normalizeWhatsAppId('1234567890')).toBe('1234567890');
  });
});
