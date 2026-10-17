import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

function lastLoggedJson(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  return JSON.parse(spy.mock.calls.at(-1)?.[0] as string);
}

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserva message/stack de um Error de verdade (JSON.stringify sozinho perde isso)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('algo falhou', { error: new Error('conexão recusada') });

    const logged = lastLoggedJson(spy);
    expect((logged.error as { message: string }).message).toBe('conexão recusada');
    expect(logged.error).toHaveProperty('stack');
  });

  it('mantém objetos de erro já planos (ex: erro do Supabase) intactos', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('query falhou', { error: { message: 'duplicate key', code: '23505' } });

    const logged = lastLoggedJson(spy);
    expect(logged.error).toEqual({ message: 'duplicate key', code: '23505' });
  });

  it('info/warn/error vão pro console certo', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.info('ok');
    logger.warn('cuidado');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
