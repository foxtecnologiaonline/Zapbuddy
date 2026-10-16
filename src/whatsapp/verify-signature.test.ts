import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWhatsAppSignature } from './verify-signature';

const appSecret = 'test-secret';
const rawBody = JSON.stringify({ hello: 'world' });
const validSignature = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

describe('verifyWhatsAppSignature', () => {
  it('aceita assinatura válida', () => {
    expect(verifyWhatsAppSignature(rawBody, validSignature, appSecret)).toBe(true);
  });

  it('rejeita corpo adulterado', () => {
    expect(verifyWhatsAppSignature(rawBody + 'x', validSignature, appSecret)).toBe(false);
  });

  it('rejeita secret errado', () => {
    expect(verifyWhatsAppSignature(rawBody, validSignature, 'wrong-secret')).toBe(false);
  });

  it('rejeita header ausente', () => {
    expect(verifyWhatsAppSignature(rawBody, null, appSecret)).toBe(false);
  });

  it('rejeita header malformado', () => {
    expect(verifyWhatsAppSignature(rawBody, 'sha256=', appSecret)).toBe(false);
  });

  it('rejeita algoritmo diferente de sha256', () => {
    expect(verifyWhatsAppSignature(rawBody, 'sha1=' + 'a'.repeat(64), appSecret)).toBe(false);
  });
});
