import { beforeEach, describe, expect, it } from 'vitest';

describe('admin session cookie sign/verify', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-nao-use-em-producao';
    process.env.ADMIN_PASSWORD = 'senha-de-teste';
  });

  it('round-trip: assina e verifica corretamente', async () => {
    const { createAdminSessionCookieValue, isAdminSessionCookieValid } = await import('./admin-session.js');
    const cookie = createAdminSessionCookieValue();
    expect(isAdminSessionCookieValid(cookie)).toBe(true);
  });

  it('rejeita cookie adulterado (payload trocado, assinatura antiga)', async () => {
    const { createAdminSessionCookieValue, isAdminSessionCookieValid } = await import('./admin-session.js');
    const cookie = createAdminSessionCookieValue();
    const [, signature] = cookie.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ admin: true, exp: Date.now() + 1e9 })).toString(
      'base64url',
    );
    const tampered = `${tamperedPayload}.${signature}`;
    expect(tampered).not.toBe(cookie);
    expect(isAdminSessionCookieValid(tampered)).toBe(false);
  });

  it('rejeita cookie malformado ou ausente', async () => {
    const { isAdminSessionCookieValid } = await import('./admin-session.js');
    expect(isAdminSessionCookieValid(undefined)).toBe(false);
    expect(isAdminSessionCookieValid('')).toBe(false);
    expect(isAdminSessionCookieValid('sem-ponto-nenhum')).toBe(false);
    expect(isAdminSessionCookieValid('a.b.c')).toBe(false);
  });

  it('rejeita cookie expirado', async () => {
    const { isAdminSessionCookieValid } = await import('./admin-session.js');
    const { createHmac } = await import('node:crypto');
    const payload = { admin: true, exp: Date.now() - 1000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', process.env.SESSION_SECRET!).update(encoded).digest('base64url');
    expect(isAdminSessionCookieValid(`${encoded}.${signature}`)).toBe(false);
  });

  it('senha do admin: aceita só a correta, com timing-safe compare', async () => {
    const { isAdminPasswordCorrect } = await import('./admin-session.js');
    expect(isAdminPasswordCorrect('senha-de-teste')).toBe(true);
    expect(isAdminPasswordCorrect('errada')).toBe(false);
    expect(isAdminPasswordCorrect('')).toBe(false);
  });

  it('senha do admin: nunca autentica se ADMIN_PASSWORD não estiver setado', async () => {
    delete process.env.ADMIN_PASSWORD;
    const { isAdminPasswordCorrect } = await import('./admin-session.js');
    expect(isAdminPasswordCorrect('qualquer-coisa')).toBe(false);
  });
});
