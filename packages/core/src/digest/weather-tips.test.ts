import { describe, expect, it } from 'vitest';
import type { TodayWeatherSummary } from '../weather/openweathermap.js';
import { buildWeatherTips, weatherEmoji } from './weather-tips.js';

function weather(overrides: Partial<TodayWeatherSummary> = {}): TodayWeatherSummary {
  return {
    minTempC: 20,
    maxTempC: 25,
    description: 'céu limpo',
    conditionId: 800,
    rainExpected: false,
    periods: { morning: null, afternoon: null, evening: null },
    ...overrides,
  };
}

describe('weatherEmoji', () => {
  it('mapeia as famílias de condição', () => {
    expect(weatherEmoji(211)).toBe('⛈️');
    expect(weatherEmoji(301)).toBe('🌦️');
    expect(weatherEmoji(500)).toBe('🌧️');
    expect(weatherEmoji(600)).toBe('❄️');
    expect(weatherEmoji(741)).toBe('🌫️');
    expect(weatherEmoji(800)).toBe('☀️');
    expect(weatherEmoji(802)).toBe('⛅');
    expect(weatherEmoji(804)).toBe('☁️');
  });
});

describe('buildWeatherTips', () => {
  it('sem nada notável, sem dicas', () => {
    expect(buildWeatherTips(weather())).toEqual([]);
  });

  it('chuva em um período só cita o período', () => {
    const tips = buildWeatherTips(
      weather({ rainExpected: true, periods: { morning: { avgTempC: 22, rain: false }, afternoon: { avgTempC: 24, rain: true }, evening: null } }),
    );
    expect(tips).toEqual(['Vai chover à tarde — leve o guarda-chuva.']);
  });

  it('chuva em mais de um período (ou sem detalhe) vira aviso genérico', () => {
    expect(buildWeatherTips(weather({ rainExpected: true }))[0]).toContain('chance de chuva');
  });

  it('manhã fresca com tarde quente: casaco + calor', () => {
    const tips = buildWeatherTips(
      weather({ minTempC: 14, maxTempC: 32, periods: { morning: { avgTempC: 15, rain: false }, afternoon: null, evening: null } }),
    );
    expect(tips).toEqual(['Começa fresquinho, leve um casaco — esquenta ao longo do dia.', 'Calorão: capricha na água e no protetor solar.']);
  });

  it('dia frio o dia todo', () => {
    expect(buildWeatherTips(weather({ minTempC: 9, maxTempC: 16 }))).toEqual(['Dia frio — vá bem agasalhado.']);
  });

  it('no máximo 2 dicas', () => {
    const tips = buildWeatherTips(
      weather({ rainExpected: true, minTempC: 12, maxTempC: 33, periods: { morning: { avgTempC: 13, rain: true }, afternoon: null, evening: null } }),
    );
    expect(tips).toHaveLength(2);
  });
});
