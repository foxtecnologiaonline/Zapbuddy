import type { TodayWeatherSummary } from '../weather/openweathermap.js';

/** Emoji pela condição (IDs do OpenWeatherMap): 2xx trovoada, 3xx garoa, 5xx chuva, 6xx neve, 7xx névoa, 800 limpo, 801-802 nuvens esparsas, 803+ nublado. */
export function weatherEmoji(conditionId: number): string {
  if (conditionId >= 200 && conditionId < 300) return '⛈️';
  if (conditionId >= 300 && conditionId < 400) return '🌦️';
  if (conditionId >= 500 && conditionId < 600) return '🌧️';
  if (conditionId >= 600 && conditionId < 700) return '❄️';
  if (conditionId >= 700 && conditionId < 800) return '🌫️';
  if (conditionId === 800) return '☀️';
  if (conditionId === 801 || conditionId === 802) return '⛅';
  return '☁️';
}

/**
 * Até 2 dicas práticas a partir da previsão (guarda-chuva, casaco, protetor
 * solar) — em vez de só repetir os números. Regras determinísticas sobre os
 * dados que já temos, nunca texto livre gerado.
 */
export function buildWeatherTips(weather: TodayWeatherSummary): string[] {
  const tips: string[] = [];
  const { morning, afternoon, evening } = weather.periods;

  if (weather.rainExpected) {
    const rainPeriods = [
      morning?.rain ? 'de manhã' : null,
      afternoon?.rain ? 'à tarde' : null,
      evening?.rain ? 'à noite' : null,
    ].filter((p): p is string => p !== null);
    tips.push(
      rainPeriods.length === 1
        ? `Vai chover ${rainPeriods[0]} — leve o guarda-chuva.`
        : 'Tem chance de chuva hoje — vale levar o guarda-chuva.',
    );
  }

  const swing = weather.maxTempC - weather.minTempC;
  if (weather.maxTempC <= 17) {
    tips.push('Dia frio — vá bem agasalhado.');
  } else if ((morning && morning.avgTempC <= 16) || weather.minTempC <= 15) {
    tips.push(swing >= 8 ? 'Começa fresquinho, leve um casaco — esquenta ao longo do dia.' : 'Está fresquinho, leve um casaco.');
  }

  if (weather.maxTempC >= 31) {
    tips.push('Calorão: capricha na água e no protetor solar.');
  } else if (weather.maxTempC >= 28 && !weather.rainExpected) {
    tips.push('Dia quente — protetor solar e bastante água.');
  }

  return tips.slice(0, 2);
}
