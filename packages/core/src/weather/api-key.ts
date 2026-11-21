import { logger } from '@zapbuddy/db';

let warnedMissingKey = false;

/**
 * Chave do OpenWeatherMap, ou null. Um único ponto de leitura (previsão, geocoding, tool get_weather):
 * - `trim()`: espaço ou quebra de linha colados no fim do valor no `.env` viram 401 "Invalid API key" — e a chave "existia";
 * - sem a chave, o resumo matinal e a tool saem sem clima em silêncio, então avisa uma vez por processo (antes só a previsão
 *   avisava; o geocoding — set_city — falhava calado e a pessoa ouvia "não achei essa cidade").
 */
export function getOpenWeatherMapKey(): string | null {
  const key = process.env.OPENWEATHERMAP_API_KEY?.trim();
  if (key) return key;
  if (!warnedMissingKey) {
    warnedMissingKey = true;
    logger.warn('weather_api_key_missing', { hint: 'OPENWEATHERMAP_API_KEY precisa estar no .env do WORKER (VPS), não só na Vercel' });
  }
  return null;
}

/** Só pros testes. */
export function resetWeatherKeyWarning(): void {
  warnedMissingKey = false;
}

/**
 * Resumo curto de uma resposta HTTP de erro, pro log: o status sozinho (401? 429?) obrigava a adivinhar. A API devolve JSON com
 * `message` ("Invalid API key…", "Your account is temporary blocked due to exceeding of requests limitation…"); sem segredo ali.
 */
export async function describeHttpFailure(response: Response): Promise<{ status: number; apiMessage?: string }> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? { status: response.status, apiMessage: body.message.slice(0, 160) } : { status: response.status };
  } catch {
    return { status: response.status };
  }
}
