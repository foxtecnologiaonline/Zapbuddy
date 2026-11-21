import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ eval: vi.fn() }));
vi.mock('../redis.js', () => ({ getRedisConnection: () => redis }));

import { isAdminLoginRateLimited, isRateLimited } from './rate-limit.js';

beforeEach(() => {
  redis.eval.mockReset();
});

describe('isRateLimited — contador e validade num comando só', () => {
  it('usa UM script atômico (INCR + EXPIRE), com a chave do número e a janela de 60s', async () => {
    redis.eval.mockResolvedValue(1);
    await isRateLimited('5511999999999');

    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, windowSeconds] = redis.eval.mock.calls[0]!;
    expect(numKeys).toBe(1);
    expect(key).toBe('ratelimit:msg:5511999999999');
    expect(windowSeconds).toBe(60);
    // O que importa do script: incrementa, e define validade na 1ª vez E quando a chave ficou sem validade (cura o bloqueio eterno).
    expect(script).toContain("redis.call('INCR'");
    expect(script).toContain("redis.call('EXPIRE'");
    expect(script).toMatch(/TTL.*< 0/);
  });

  it('libera até 20 mensagens na janela e limita da 21ª em diante', async () => {
    redis.eval.mockResolvedValue(20);
    expect(await isRateLimited('5511999999999')).toBe(false);
    redis.eval.mockResolvedValue(21);
    expect(await isRateLimited('5511999999999')).toBe(true);
  });

  it('o Redis pode devolver o contador como texto: ainda compara como número', async () => {
    redis.eval.mockResolvedValue('21');
    expect(await isRateLimited('5511999999999')).toBe(true);
  });

  it('erro do Redis propaga (o webhook decide o que fazer com a falha de infraestrutura)', async () => {
    redis.eval.mockRejectedValue(new Error('max requests limit exceeded'));
    await expect(isRateLimited('5511999999999')).rejects.toThrow('max requests limit exceeded');
  });
});

describe('isAdminLoginRateLimited', () => {
  it('janela de 15 min e limite de 5 tentativas, na mesma lógica atômica', async () => {
    redis.eval.mockResolvedValue(5);
    expect(await isAdminLoginRateLimited('1.2.3.4')).toBe(false);
    expect(redis.eval.mock.calls[0]![2]).toBe('ratelimit:admin-login:1.2.3.4');
    expect(redis.eval.mock.calls[0]![3]).toBe(900);
    redis.eval.mockResolvedValue(6);
    expect(await isAdminLoginRateLimited('1.2.3.4')).toBe(true);
  });
});
