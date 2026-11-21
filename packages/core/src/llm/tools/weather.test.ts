import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findUserById: vi.fn(), inferLocationFromWhatsappNumber: vi.fn() }));
const weather = vi.hoisted(() => ({ getWeatherForecast: vi.fn() }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../../weather/openweathermap.js', () => weather);

import { getWeatherTool } from './weather.js';

const ctx = { userId: 'u1', whatsappNumber: '5511999990000', messageSource: 'text' as const, timezone: 'America/Sao_Paulo', accountId: 'a1', role: 'owner' as const };
const day = { date: '2026-11-22', minTempC: 17, maxTempC: 27, description: 'nublado', rainExpected: true, rainChancePercent: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  db.findUserById.mockResolvedValue({ city: null, city_latitude: null, city_longitude: null });
  db.inferLocationFromWhatsappNumber.mockReturnValue({ city: 'São Paulo', uf: 'SP', latitude: -23.55, longitude: -46.63 });
});

describe('get_weather', () => {
  it('devolve como está AGORA junto da previsão (pra "tá frio agora?")', async () => {
    weather.getWeatherForecast.mockResolvedValue({
      status: 'ok',
      place: 'São Paulo',
      days: [day],
      now: { tempC: 18, feelsLikeC: 17, description: 'chuva leve', conditionId: 500, humidityPercent: 88 },
    });

    const result = await getWeatherTool.execute({ days: 2 }, ctx);

    expect(result).toMatchObject({
      status: 'ok',
      used_person_region: true,
      now: { temp_c: 18, feels_like_c: 17, description: 'chuva leve', humidity_percent: 88 },
      days: [{ date: '2026-11-22', min_c: 17, max_c: 27, rain_expected: true, rain_chance_percent: 60 }],
    });
  });

  it('sem observação de agora, o campo now nem aparece (o Tom não tem número pra inventar)', async () => {
    weather.getWeatherForecast.mockResolvedValue({ status: 'ok', place: 'São Paulo', days: [day], now: null });
    const result = (await getWeatherTool.execute({ days: 1 }, ctx)) as Record<string, unknown>;
    expect('now' in result).toBe(false);
  });

  it('cidade cadastrada pela pessoa vale mais que a região do DDD', async () => {
    db.findUserById.mockResolvedValue({ city: 'Manaus', city_latitude: -3.1, city_longitude: -60.0 });
    weather.getWeatherForecast.mockResolvedValue({ status: 'ok', place: 'Manaus', days: [day], now: null });

    await getWeatherTool.execute({ days: 1 }, ctx);

    expect(weather.getWeatherForecast).toHaveBeenCalledWith(expect.objectContaining({ fallback: { city: 'Manaus', latitude: -3.1, longitude: -60.0 } }));
  });

  it('cidade pedida na conversa: não é a região da pessoa (used_person_region false)', async () => {
    weather.getWeatherForecast.mockResolvedValue({ status: 'ok', place: 'Curitiba - PR', days: [day], now: null });
    expect(await getWeatherTool.execute({ city: 'Curitiba', days: 1 }, ctx)).toMatchObject({ used_person_region: false, place: 'Curitiba - PR' });
  });

  it('qualquer status diferente de ok só repassa o status (o Tom diz que não conseguiu checar)', async () => {
    for (const status of ['not_configured', 'place_not_found', 'unavailable']) {
      weather.getWeatherForecast.mockResolvedValue({ status });
      expect(await getWeatherTool.execute({ days: 1 }, ctx)).toEqual({ status });
    }
  });
});
