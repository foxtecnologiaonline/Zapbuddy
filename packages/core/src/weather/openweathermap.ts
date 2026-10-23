import { logger } from '@zapbuddy/db';
import { datePartsInZone, getLocalHour } from '../time/zoned-ranges.js';
import { fetchWithRetry } from '../whatsapp/http-retry.js';

export interface WeatherPeriod {
  avgTempC: number;
  rain: boolean;
}

export interface TodayWeatherSummary {
  minTempC: number;
  maxTempC: number;
  /** Descrição em pt-BR já traduzida pela própria API (ex.: "chuva leve", "céu limpo") — não reescrita aqui. */
  description: string;
  /** ID de condição do OpenWeatherMap (2xx trovoada, 3xx garoa, 5xx chuva, 6xx neve, 7xx névoa, 800 limpo, 80x nuvens) — pro emoji. */
  conditionId: number;
  rainExpected: boolean;
  /** Manhã (5h-11h), tarde (12h-17h) e noite (18h-23h) locais; null quando a previsão restante do dia não cobre o período. */
  periods: { morning: WeatherPeriod | null; afternoon: WeatherPeriod | null; evening: WeatherPeriod | null };
}

export interface OpenWeatherMapForecastEntry {
  dt: number;
  main: { temp: number; temp_min: number; temp_max: number };
  weather: Array<{ id: number; description: string }>;
  pop: number;
}

interface OpenWeatherMapForecastResponse {
  list?: OpenWeatherMapForecastEntry[];
}

/**
 * Chuva = trovoada (2xx), garoa (3xx) ou chuva (5xx) nos IDs do OpenWeatherMap,
 * ou probabilidade de precipitação >= 40%. (Antes isto usava faixas da escala
 * WMO do Open-Meteo, que não existem nos IDs do OpenWeatherMap — só o `pop`
 * detectava chuva.)
 */
function entryMeansRain(entry: OpenWeatherMapForecastEntry): boolean {
  const code = entry.weather[0]?.id ?? 0;
  return (code >= 200 && code < 600) || entry.pop >= 0.4;
}

function summarizePeriod(entries: OpenWeatherMapForecastEntry[]): WeatherPeriod | null {
  if (entries.length === 0) return null;
  const avg = entries.reduce((sum, entry) => sum + entry.main.temp, 0) / entries.length;
  return { avgTempC: Math.round(avg), rain: entries.some(entryMeansRain) };
}

/**
 * Pura (sem rede): agrega as entradas de 3h que caem no dia local de
 * `now`. `main.temp_min`/`_max` de cada entrada é "no momento do cálculo"
 * (não o mínimo/máximo real do período, segundo a doc do OpenWeatherMap) —
 * min/máx do dia é uma aproximação por cima dessas entradas.
 */
export function summarizeForecast(
  entries: OpenWeatherMapForecastEntry[],
  timezone: string,
  now: Date = new Date(),
): TodayWeatherSummary | null {
  const today = datePartsInZone(timezone, now);
  const todayEntries: Array<{ entry: OpenWeatherMapForecastEntry; hour: number }> = [];
  for (const entry of entries) {
    const at = new Date(entry.dt * 1000);
    const parts = datePartsInZone(timezone, at);
    if (parts.year === today.year && parts.month === today.month && parts.day === today.day) {
      todayEntries.push({ entry, hour: getLocalHour(timezone, at) });
    }
  }
  if (todayEntries.length === 0) return null;

  const minTempC = Math.min(...todayEntries.map(({ entry }) => entry.main.temp_min));
  const maxTempC = Math.max(...todayEntries.map(({ entry }) => entry.main.temp_max));

  // Entrada mais próxima do meio-dia local representa melhor "o dia" que a primeira do período.
  let midday = todayEntries[0]!;
  for (const candidate of todayEntries) {
    if (Math.abs(candidate.hour - 12) < Math.abs(midday.hour - 12)) midday = candidate;
  }

  const inRange = (from: number, to: number) =>
    todayEntries.filter(({ hour }) => hour >= from && hour <= to).map(({ entry }) => entry);

  return {
    minTempC: Math.round(minTempC),
    maxTempC: Math.round(maxTempC),
    description: midday.entry.weather[0]?.description ?? 'tempo variável',
    conditionId: midday.entry.weather[0]?.id ?? 800,
    rainExpected: todayEntries.some(({ entry }) => entryMeansRain(entry)),
    periods: {
      morning: summarizePeriod(inRange(5, 11)),
      afternoon: summarizePeriod(inRange(12, 17)),
      evening: summarizePeriod(inRange(18, 23)),
    },
  };
}

const CACHE_TTL_MS = 3 * 60 * 60_000;
// Falha também é guardada por pouco tempo: sem isso, uma queda da API faria
// cada usuário do mesmo lugar insistir (e re-tentar) na hora do pico.
const NEGATIVE_CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { expiresAt: number; value: TodayWeatherSummary | null }>();
const inflight = new Map<string, Promise<TodayWeatherSummary | null>>();

/** Só pros testes. */
export function clearWeatherCache(): void {
  cache.clear();
  inflight.clear();
}

async function fetchTodayWeather(input: { latitude: number; longitude: number; timezone: string }, apiKey: string): Promise<TodayWeatherSummary | null> {
  try {
    // cnt=16 (2 dias em passos de 3h) é margem de sobra pro resto do dia local: a previsão só
    // cobre pra frente a partir de agora — payload menos da metade do default (40 entradas).
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${input.latitude}&lon=${input.longitude}&appid=${apiKey}&units=metric&lang=pt_br&cnt=16`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
    if (!response.ok) {
      logger.error('weather_forecast_http_error', { status: response.status, latitude: input.latitude, longitude: input.longitude });
      return null;
    }
    const body = (await response.json()) as OpenWeatherMapForecastResponse;
    return summarizeForecast(body.list ?? [], input.timezone);
  } catch (error) {
    logger.error('weather_forecast_failed', {
      error: error instanceof Error ? error.message : String(error),
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return null;
  }
}

/**
 * Resumo do clima de hoje pro Resumo Matinal. Retorna null (nunca lança) sem
 * `OPENWEATHERMAP_API_KEY`, sem previsão pra hoje ou em falha de rede —
 * previsão é bônus da narrativa, nunca motivo pra derrubar o resumo.
 *
 * Cache em memória do processo do worker (não Redis, de propósito: o plano do
 * Upstash já estourou cota por comando — ver CLAUDE.md): coordenadas
 * arredondadas a 2 casas (~1 km) + dia local, então todo mundo do mesmo DDD
 * (ou da mesma cidade) divide uma chamada só. Pedidos simultâneos pro mesmo
 * lugar (concurrency 5 do worker) compartilham a mesma requisição em voo.
 */
export async function getTodayWeatherSummary(input: {
  latitude: number;
  longitude: number;
  timezone: string;
}): Promise<TodayWeatherSummary | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  const today = datePartsInZone(input.timezone, new Date());
  const key = `${input.latitude.toFixed(2)},${input.longitude.toFixed(2)}|${input.timezone}|${today.year}-${today.month}-${today.day}`;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchTodayWeather(input, apiKey)
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + (value ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS) });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}
