import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { logger } from '@zapbuddy/db';
import { describeHttpFailure, getOpenWeatherMapKey, resetWeatherKeyWarning } from './api-key.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  resetWeatherKeyWarning();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getOpenWeatherMapKey', () => {
  it('devolve a chave aparada (espaço/quebra de linha no fim do .env)', () => {
    process.env.OPENWEATHERMAP_API_KEY = '  abc123\n';
    expect(getOpenWeatherMapKey()).toBe('abc123');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('sem chave (ou só espaços): null, e avisa UMA vez por processo — também quando quem chama é o geocoding', () => {
    delete process.env.OPENWEATHERMAP_API_KEY;
    expect(getOpenWeatherMapKey()).toBeNull();
    process.env.OPENWEATHERMAP_API_KEY = '   ';
    expect(getOpenWeatherMapKey()).toBeNull();
    expect(getOpenWeatherMapKey()).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('weather_api_key_missing', expect.objectContaining({ hint: expect.stringContaining('WORKER') }));
  });
});

describe('describeHttpFailure', () => {
  it('traz status e a mensagem da API, truncada', async () => {
    const response = { status: 429, json: async () => ({ message: 'x'.repeat(500) }) } as unknown as Response;
    const result = await describeHttpFailure(response);
    expect(result.status).toBe(429);
    expect(result.apiMessage).toHaveLength(160);
  });

  it('corpo que não é JSON (ou sem message) devolve só o status, sem lançar', async () => {
    expect(await describeHttpFailure({ status: 502, json: async () => { throw new Error('html'); } } as unknown as Response)).toEqual({ status: 502 });
    expect(await describeHttpFailure({ status: 500, json: async () => ({ cod: 500 }) } as unknown as Response)).toEqual({ status: 500 });
  });
});
