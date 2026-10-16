import { describe, it, expect, afterAll } from 'vitest';
import { isRateLimited } from './rate-limit';
import { getRedis } from './redis';

// Testa contra Redis real (REDIS_URL definido no ambiente), não mock —
// a lógica de INCR+EXPIRE é simples o bastante pra valer testar de fato.
describe('isRateLimited', () => {
  afterAll(async () => {
    await getRedis().quit();
  });

  it('libera enquanto estiver dentro do limite', async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(await isRateLimited(key, 5, 60)).toBe(false);
    }
  });

  it('bloqueia ao exceder o limite na mesma janela', async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(await isRateLimited(key, 3, 60)).toBe(false);
    }
    expect(await isRateLimited(key, 3, 60)).toBe(true);
  });

  it('chaves diferentes têm contadores independentes', async () => {
    const keyA = `test:a:${Date.now()}`;
    const keyB = `test:b:${Date.now()}`;

    for (let i = 0; i < 3; i++) await isRateLimited(keyA, 3, 60);
    expect(await isRateLimited(keyA, 3, 60)).toBe(true);
    expect(await isRateLimited(keyB, 3, 60)).toBe(false);
  });

  it('expira e libera de novo após a janela passar', async () => {
    const key = `test:expire:${Date.now()}`;
    expect(await isRateLimited(key, 1, 1)).toBe(false);
    expect(await isRateLimited(key, 1, 1)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(await isRateLimited(key, 1, 1)).toBe(false);
  });
});
