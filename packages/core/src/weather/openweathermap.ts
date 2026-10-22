import { logger } from '@zapbuddy/db';
import { datePartsInZone, getLocalHour } from '../time/zoned-ranges.js';
import { fetchWithRetry } from '../whatsapp/http-retry.js';

export interface TodayWeatherSummary {
  minTempC: number;
  maxTempC: number;
  /** Descrição em pt-BR já traduzida pela própria API (ex.: "chuva leve", "céu limpo") — não reescrita aqui. */
  description: string;
  rainExpected: boolean;
}

interface OpenWeatherMapForecastEntry {
  dt: number;
  main: { temp_min: number; temp_max: number };
  weather: Array<{ id: number; description: string }>;
  pop: number;
}

interface OpenWeatherMapForecastResponse {
  list?: OpenWeatherMapForecastEntry[];
}

// Faixas de código WMO/OpenWeatherMap que indicam chuva/trovoada (drizzle, chuva, chuvisco e trovoada).
function entryMeansRain(entry: OpenWeatherMapForecastEntry): boolean {
  const code = entry.weather[0]?.id ?? 0;
  const isRainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
  return isRainCode || entry.pop >= 0.4;
}

/**
 * Resumo do clima de hoje (min/máx + condição + chance de chuva) pro
 * Resumo Matinal — usa a previsão "5 day / 3 hour forecast" do
 * OpenWeatherMap (free tier, sem precisar de assinatura/cartão), filtrando
 * só as entradas que cabem no dia local da pessoa. `main.temp_min`/`_max`
 * de cada entrada é "no momento do cálculo" (não o mínimo/máximo real do
 * período de 3h, segundo a própria doc do OpenWeatherMap) — min/máx do dia
 * aqui é uma aproximação por cima dessas entradas, não um valor oficial do
 * provedor. Retorna null (nunca lança) sem `OPENWEATHERMAP_API_KEY`, sem
 * entrada pra hoje ou em qualquer falha de rede — mesmo padrão de
 * degradação graciosa de `embedText`/`web-search/client.ts`: previsão é um
 * bônus da narrativa, nunca motivo pra derrubar o resumo matinal inteiro.
 */
export async function getTodayWeatherSummary(input: {
  latitude: number;
  longitude: number;
  timezone: string;
}): Promise<TodayWeatherSummary | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${input.latitude}&lon=${input.longitude}&appid=${apiKey}&units=metric&lang=pt_br`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
    if (!response.ok) {
      logger.error('weather_forecast_http_error', { status: response.status });
      return null;
    }

    const body = (await response.json()) as OpenWeatherMapForecastResponse;
    const entries = body.list ?? [];

    const today = datePartsInZone(input.timezone, new Date());
    const todayEntries = entries.filter((entry) => {
      const parts = datePartsInZone(input.timezone, new Date(entry.dt * 1000));
      return parts.year === today.year && parts.month === today.month && parts.day === today.day;
    });
    if (todayEntries.length === 0) return null;

    const minTempC = Math.min(...todayEntries.map((entry) => entry.main.temp_min));
    const maxTempC = Math.max(...todayEntries.map((entry) => entry.main.temp_max));
    const rainExpected = todayEntries.some(entryMeansRain);

    // Entrada mais próxima do meio-dia local representa melhor "o dia" do que a primeira do período.
    const middayEntry = todayEntries.reduce((closest, entry) => {
      const hourDiff = (candidate: OpenWeatherMapForecastEntry) => Math.abs(getLocalHour(input.timezone, new Date(candidate.dt * 1000)) - 12);
      return hourDiff(entry) < hourDiff(closest) ? entry : closest;
    });

    return {
      minTempC: Math.round(minTempC),
      maxTempC: Math.round(maxTempC),
      description: middayEntry.weather[0]?.description ?? 'tempo variável',
      rainExpected,
    };
  } catch (error) {
    logger.error('weather_forecast_failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
