import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getTodayWeatherSummary } from './openweathermap.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const TZ = 'America/Sao_Paulo';

function utcSecondsForLocalHour(hour: number): number {
  // Dia local 2026-10-22 em America/Sao_Paulo (UTC-3, sem horário de verão hoje).
  return Date.UTC(2026, 9, 22, hour + 3, 0, 0) / 1000;
}

beforeEach(() => {
  process.env.OPENWEATHERMAP_API_KEY = 'test-key';
  // Só o relógio (Date) é congelado — setTimeout real, pro retry/backoff de
  // fetchWithRetry (usado internamente) seguir funcionando normalmente.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 15, 0, 0))); // 12h local
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getTodayWeatherSummary', () => {
  it('sem OPENWEATHERMAP_API_KEY, retorna null sem chamar a API', async () => {
    delete process.env.OPENWEATHERMAP_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getTodayWeatherSummary({ latitude: -23.55, longitude: -46.63, timezone: TZ });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('agrega as entradas de hoje: min/máx, condição do meio-dia e chuva esperada', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        list: [
          { dt: utcSecondsForLocalHour(9), main: { temp_min: 17, temp_max: 19 }, weather: [{ id: 801, description: 'nuvens dispersas' }], pop: 0.1 },
          { dt: utcSecondsForLocalHour(12), main: { temp_min: 22, temp_max: 26 }, weather: [{ id: 500, description: 'chuva leve' }], pop: 0.5 },
          { dt: utcSecondsForLocalHour(15), main: { temp_min: 24, temp_max: 27 }, weather: [{ id: 800, description: 'céu limpo' }], pop: 0.0 },
          // Dia seguinte — não deve entrar no agregado de hoje.
          { dt: utcSecondsForLocalHour(33), main: { temp_min: 10, temp_max: 12 }, weather: [{ id: 600, description: 'neve' }], pop: 0.9 },
        ],
      }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getTodayWeatherSummary({ latitude: -23.55, longitude: -46.63, timezone: TZ });

    expect(result).toEqual({
      minTempC: 17,
      maxTempC: 27,
      description: 'chuva leve',
      rainExpected: true,
    });
  });

  it('sem entrada pra hoje, retorna null', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ list: [{ dt: utcSecondsForLocalHour(33), main: { temp_min: 10, temp_max: 12 }, weather: [{ id: 800, description: 'céu limpo' }], pop: 0 }] }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getTodayWeatherSummary({ latitude: -23.55, longitude: -46.63, timezone: TZ });

    expect(result).toBeNull();
  });

  it('em erro HTTP, retorna null sem lançar', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    const result = await getTodayWeatherSummary({ latitude: -23.55, longitude: -46.63, timezone: TZ });

    expect(result).toBeNull();
  });

  it('em falha de rede, retorna null sem lançar', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const result = await getTodayWeatherSummary({ latitude: -23.55, longitude: -46.63, timezone: TZ });

    expect(result).toBeNull();
  });
});
