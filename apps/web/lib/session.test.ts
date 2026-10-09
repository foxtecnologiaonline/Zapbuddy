import { beforeEach, describe, expect, it } from 'vitest';

describe('session cookie sign/verify', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-nao-use-em-producao';
  });

  it('round-trip: assina e verifica corretamente, devolvendo o userId', async () => {
    const { createSessionCookieValue, verifySessionCookieValue } = await import('./session.js');
    const cookie = createSessionCookieValue('user-123');
    expect(verifySessionCookieValue(cookie)).toBe('user-123');
  });

  it('rejeita cookie adulterado (payload trocado, assinatura antiga)', async () => {
    const { createSessionCookieValue, verifySessionCookieValue } = await import('./session.js');
    const cookie = createSessionCookieValue('user-123');
    const [encoded, signature] = cookie.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'attacker', exp: Date.now() + 1e9 })).toString(
      'base64url',
    );
    const tampered = `${tamperedPayload}.${signature}`;
    expect(tampered).not.toBe(cookie);
    expect(encoded).toBeTruthy();
    expect(verifySessionCookieValue(tampered)).toBeNull();
  });

  it('rejeita cookie malformado ou ausente', async () => {
    const { verifySessionCookieValue } = await import('./session.js');
    expect(verifySessionCookieValue(undefined)).toBeNull();
    expect(verifySessionCookieValue('')).toBeNull();
    expect(verifySessionCookieValue('sem-ponto-nenhum')).toBeNull();
    expect(verifySessionCookieValue('a.b.c')).toBeNull();
  });

  it('rejeita cookie expirado', async () => {
    const { verifySessionCookieValue } = await import('./session.js');
    // Monta manualmente um cookie com exp no passado, assinado com o mesmo segredo.
    const { createHmac } = await import('node:crypto');
    const payload = { userId: 'user-123', exp: Date.now() - 1000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', process.env.SESSION_SECRET!).update(encoded).digest('base64url');
    expect(verifySessionCookieValue(`${encoded}.${signature}`)).toBeNull();
  });
});
