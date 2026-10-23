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
    // cnt=16 (2 dias em passos de 3h) é margem de sobra pro resto do dia local, já que o job
    // roda de manhã (8h local) e a previsão só cobre pra frente a partir de agora — baixa o
    // payload pra menos da metade do default (40 entradas / 5 dias) sem perder nada de hoje.
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${input.latitude}&lon=${input.longitude}&appid=${apiKey}&units=metric&lang=pt_br&cnt=16`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
    if (!response.ok) {
      logger.error('weather_forecast_http_error', { status: response.status, latitude: input.latitude, longitude: input.longitude });
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

    // Entrada mais próxima do meio-dia local representa melhor "o dia" do que a primeira do
    // período — cada entrada só passa por getLocalHour uma vez (evita recalcular a do "closest"
    // atual em toda iteração do reduce).
    let middayEntry = todayEntries[0]!;
    let smallestHourDiff = Infinity;
    for (const entry of todayEntries) {
      const hourDiff = Math.abs(getLocalHour(input.timezone, new Date(entry.dt * 1000)) - 12);
      if (hourDiff < smallestHourDiff) {
        smallestHourDiff = hourDiff;
        middayEntry = entry;
      }
    }

    return {
      minTempC: Math.round(minTempC),
      maxTempC: Math.round(maxTempC),
      description: middayEntry.weather[0]?.description ?? 'tempo variável',
      rainExpected,
    };
  } catch (error) {
    logger.error('weather_forecast_failed', {
      error: error instanceof Error ? error.message : String(error),
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return null;
  }
}

export interface DailyForecast {
  /** Data local da previsão (YYYY-MM-DD) no fuso informado. */
  date: string;
  minTempC: number;
  maxTempC: number;
  description: string;
  rainExpected: boolean;
  /** Maior chance de chuva (0-100) entre as janelas de 3h do dia, como o provedor informa. */
  rainChancePercent: number;
}

/** Entradas da previsão de 3h agrupadas por data local — pura, testável sem rede. */
export function groupForecastByLocalDay(entries: OpenWeatherMapForecastEntry[], timezone: string): DailyForecast[] {
  const byDay = new Map<string, OpenWeatherMapForecastEntry[]>();
  for (const entry of entries) {
    const parts = datePartsInZone(timezone, new Date(entry.dt * 1000));
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  return [...byDay.entries()].map(([date, dayEntries]) => {
    let middayEntry = dayEntries[0]!;
    let smallestHourDiff = Infinity;
    for (const entry of dayEntries) {
      const hourDiff = Math.abs(getLocalHour(timezone, new Date(entry.dt * 1000)) - 12);
      if (hourDiff < smallestHourDiff) {
        smallestHourDiff = hourDiff;
        middayEntry = entry;
      }
    }
    return {
      date,
      minTempC: Math.round(Math.min(...dayEntries.map((entry) => entry.main.temp_min))),
      maxTempC: Math.round(Math.max(...dayEntries.map((entry) => entry.main.temp_max))),
      description: middayEntry.weather[0]?.description ?? 'tempo variável',
      rainExpected: dayEntries.some(entryMeansRain),
      rainChancePercent: Math.round(Math.max(...dayEntries.map((entry) => entry.pop)) * 100),
    };
  });
}

export type WeatherLookup =
  | { status: 'ok'; place: string; days: DailyForecast[] }
  | { status: 'not_configured' }
  | { status: 'place_not_found' }
  | { status: 'unavailable' };

interface GeocodeHit {
  name: string;
  state?: string;
  country: string;
  lat: number;
  lon: number;
}

/** Cidade → coordenadas via geocoding do OpenWeatherMap. País fixo BR: o produto é brasileiro e "Santos" não deve cair em Portugal. */
async function geocodeBrazilianCity(city: string, apiKey: string): Promise<GeocodeHit | null> {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(`${city},BR`)}&limit=1&appid=${apiKey}`;
  const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
  if (!response.ok) throw new Error(`geocoding http ${response.status}`);
  const hits = (await response.json()) as GeocodeHit[];
  return hits[0] ?? null;
}

/**
 * Previsão dos próximos dias (até 5) pra tool get_weather — qualquer cidade
 * do Brasil (`city`) ou o ponto do DDD da pessoa (`fallback`). Nunca lança
 * nem inventa: sem chave, cidade desconhecida ou falha de rede devolve um
 * status explícito, e o Tom diz que não conseguiu checar.
 */
export async function getWeatherForecast(input: {
  city?: string;
  fallback: { city: string; latitude: number; longitude: number };
  timezone: string;
  days: number;
}): Promise<WeatherLookup> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return { status: 'not_configured' };

  try {
    let place = input.fallback.city;
    let latitude = input.fallback.latitude;
    let longitude = input.fallback.longitude;
    if (input.city) {
      const hit = await geocodeBrazilianCity(input.city, apiKey);
      if (!hit) return { status: 'place_not_found' };
      place = hit.state ? `${hit.name} - ${hit.state}` : hit.name;
      latitude = hit.lat;
      longitude = hit.lon;
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric&lang=pt_br`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
    if (!response.ok) {
      logger.error('weather_forecast_http_error', { status: response.status, latitude, longitude });
      return { status: 'unavailable' };
    }
    const body = (await response.json()) as OpenWeatherMapForecastResponse;
    const days = groupForecastByLocalDay(body.list ?? [], input.timezone).slice(0, input.days);
    return days.length === 0 ? { status: 'unavailable' } : { status: 'ok', place, days };
  } catch (error) {
    logger.error('weather_lookup_failed', { error: error instanceof Error ? error.message : String(error) });
    return { status: 'unavailable' };
  }
}
