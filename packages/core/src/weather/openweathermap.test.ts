import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  clearWeatherCache,
  getTodayWeatherSummary,
  getWeatherForecast,
  groupForecastByLocalDay,
  summarizeForecast,
  type OpenWeatherMapForecastEntry,
} from './openweathermap.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const TZ = 'America/Sao_Paulo';
const INPUT = { latitude: -23.55, longitude: -46.63, timezone: TZ };

// Dia local 2026-10-22 em America/Sao_Paulo (UTC-3, sem horário de verão).
function dtForLocalHour(hour: number, dayOffset = 0): number {
  return Date.UTC(2026, 9, 22 + dayOffset, hour + 3, 0, 0) / 1000;
}

function entry(hour: number, overrides: Partial<OpenWeatherMapForecastEntry> & { id?: number; description?: string } = {}, dayOffset = 0): OpenWeatherMapForecastEntry {
  const { id = 800, description = 'céu limpo', ...rest } = overrides;
  return {
    dt: dtForLocalHour(hour, dayOffset),
    main: { temp: 22, temp_min: 20, temp_max: 24 },
    weather: [{ id, description }],
    pop: 0,
    ...rest,
  };
}

beforeEach(() => {
  process.env.OPENWEATHERMAP_API_KEY = 'test-key';
  clearWeatherCache();
  // Só o relógio (Date) é congelado — setTimeout real, pro retry/backoff de fetchWithRetry.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 15, 0, 0))); // 12h local
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('summarizeForecast', () => {
  const now = new Date(Date.UTC(2026, 9, 22, 15, 0, 0));

  it('agrega só o dia local: min/máx, condição do meio-dia, períodos', () => {
    const summary = summarizeForecast(
      [
        entry(9, { main: { temp: 18, temp_min: 17, temp_max: 19 }, id: 801, description: 'nuvens dispersas' }),
        entry(12, { main: { temp: 24, temp_min: 22, temp_max: 26 }, id: 802, description: 'nuvens esparsas' }),
        entry(15, { main: { temp: 26, temp_min: 24, temp_max: 27 } }),
        entry(21, { main: { temp: 20, temp_min: 19, temp_max: 21 } }),
        entry(9, { main: { temp: 5, temp_min: 4, temp_max: 6 }, id: 600, description: 'neve' }, 1), // amanhã
      ],
      TZ,
      now,
    );

    expect(summary).toMatchObject({ minTempC: 17, maxTempC: 27, description: 'nuvens esparsas', conditionId: 802, rainExpected: false });
    expect(summary?.rainChancePercent).toBeGreaterThanOrEqual(0);
    expect(summary?.periods).toEqual({
      morning: { avgTempC: 18, rain: false },
      afternoon: { avgTempC: 25, rain: false },
      evening: { avgTempC: 20, rain: false },
    });
  });

  it('previsão de amanhã vem da mesma resposta: min/máx, condição do meio-dia e maior chance de chuva', () => {
    const summary = summarizeForecast(
      [
        entry(15),
        entry(9, { main: { temp: 16, temp_min: 15, temp_max: 17 } }, 1),
        entry(12, { id: 500, description: 'chuva leve', main: { temp: 24, temp_min: 22, temp_max: 28 }, pop: 0.7 }, 1),
        entry(18, { main: { temp: 20, temp_min: 19, temp_max: 21 }, pop: 0.2 }, 1),
      ],
      TZ,
      now,
    );

    expect(summary?.tomorrow).toEqual({ minTempC: 15, maxTempC: 28, description: 'chuva leve', conditionId: 500, rainChancePercent: 70 });
  });

  it('sem entradas de amanhã na resposta, não inventa: tomorrow ausente', () => {
    expect(summarizeForecast([entry(15)], TZ, now)?.tomorrow).toBeUndefined();
  });

  it('chuva detectada pelo ID da condição mesmo com probabilidade baixa (bug antigo: só pop >= 0.4 pegava)', () => {
    const summary = summarizeForecast([entry(15, { id: 500, description: 'chuva leve', pop: 0.2 })], TZ, now);
    expect(summary?.rainExpected).toBe(true);
    expect(summary?.periods.afternoon?.rain).toBe(true);
  });

  it('trovoada e garoa contam como chuva; nuvens (8xx) não', () => {
    expect(summarizeForecast([entry(15, { id: 211 })], TZ, now)?.rainExpected).toBe(true);
    expect(summarizeForecast([entry(15, { id: 301 })], TZ, now)?.rainExpected).toBe(true);
    expect(summarizeForecast([entry(15, { id: 804 })], TZ, now)?.rainExpected).toBe(false);
  });

  it('probabilidade alta de precipitação também conta', () => {
    expect(summarizeForecast([entry(15, { pop: 0.6 })], TZ, now)?.rainExpected).toBe(true);
  });

  it('período sem entrada fica null; sem entrada pra hoje devolve null', () => {
    const summary = summarizeForecast([entry(15)], TZ, now);
    expect(summary?.periods.morning).toBeNull();
    expect(summarizeForecast([entry(9, {}, 1)], TZ, now)).toBeNull();
  });
});

describe('getTodayWeatherSummary', () => {
  function stubFetch(list: OpenWeatherMapForecastEntry[]) {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ list }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    return fetchSpy;
  }

  it('sem OPENWEATHERMAP_API_KEY, retorna null sem chamar a API', async () => {
    delete process.env.OPENWEATHERMAP_API_KEY;
    const fetchSpy = stubFetch([]);
    expect(await getTodayWeatherSummary(INPUT)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cache: mesma localização no mesmo dia faz uma chamada só', async () => {
    const fetchSpy = stubFetch([entry(15)]);
    const first = await getTodayWeatherSummary(INPUT);
    const second = await getTodayWeatherSummary({ ...INPUT, latitude: -23.5512 }); // arredonda pra mesma chave
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('pedidos simultâneos pro mesmo lugar dividem a requisição em voo', async () => {
    const fetchSpy = stubFetch([entry(15)]);
    await Promise.all([getTodayWeatherSummary(INPUT), getTodayWeatherSummary(INPUT), getTodayWeatherSummary(INPUT)]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('lugares diferentes não compartilham cache', async () => {
    const fetchSpy = stubFetch([entry(15)]);
    await getTodayWeatherSummary(INPUT);
    await getTodayWeatherSummary({ ...INPUT, latitude: -3.73, longitude: -38.52 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falha também fica em cache curto (não martela a API fora do ar)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await getTodayWeatherSummary(INPUT)).toBeNull();
    expect(await getTodayWeatherSummary(INPUT)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falha de rede devolve null sem lançar', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    expect(await getTodayWeatherSummary(INPUT)).toBeNull();
  });
});

describe('groupForecastByLocalDay', () => {
  it('agrupa pela data LOCAL (22h em SP já é o dia seguinte em UTC) e usa a condição do meio-dia', () => {
    const days = groupForecastByLocalDay(
      [
        entry(9, { description: 'nublado', pop: 0.1, main: { temp: 16, temp_min: 15, temp_max: 18 } }),
        entry(12, { description: 'céu limpo', main: { temp: 22, temp_min: 17, temp_max: 24 } }),
        entry(22, { main: { temp: 15, temp_min: 14, temp_max: 16 } }),
        entry(12, { id: 500, description: 'chuva leve', pop: 0.8 }, 1),
      ],
      TZ,
    );

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-10-22', minTempC: 14, maxTempC: 24, description: 'céu limpo', rainExpected: false });
    expect(days[1]).toMatchObject({ date: '2026-10-23', description: 'chuva leve', rainExpected: true, rainChancePercent: 80 });
  });
});

describe('getWeatherForecast', () => {
  const fallback = { city: 'São Paulo', latitude: -23.55, longitude: -46.63 };

  it('sem chave, devolve not_configured sem chamar a API', async () => {
    delete process.env.OPENWEATHERMAP_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await getWeatherForecast({ fallback, timezone: TZ, days: 2 })).toEqual({ status: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cidade que o geocoding não acha vira place_not_found', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    expect(await getWeatherForecast({ city: 'Xyzland', fallback, timezone: TZ, days: 2 })).toEqual({ status: 'place_not_found' });
  });

  it('com cidade, geocodifica em BR e usa as coordenadas achadas', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ name: 'Curitiba', state: 'Paraná', country: 'BR', lat: -25.43, lon: -49.27 }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ list: [entry(12)] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const lookup = await getWeatherForecast({ city: 'Curitiba', fallback, timezone: TZ, days: 2 });

    expect(String(fetchSpy.mock.calls[1]![0])).toContain('lat=-25.43');
    expect(lookup).toMatchObject({ status: 'ok', place: 'Curitiba - PR' });
  });

  it('em falha de rede devolve unavailable sem lançar', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('rede')) as unknown as typeof fetch;
    expect(await getWeatherForecast({ fallback, timezone: TZ, days: 2 })).toEqual({ status: 'unavailable' });
  });
});
