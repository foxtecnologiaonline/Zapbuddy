import { logger } from '@zapbuddy/db';
import { fetchWithRetry } from '../whatsapp/http-retry.js';

export interface GeocodedCity {
  city: string;
  uf: string;
  latitude: number;
  longitude: number;
}

const STATE_NAME_TO_UF: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** "Minas Gerais" / "State of Minas Gerais" / "MG" → "MG"; null se não reconhecer. */
export function stateToUf(state: string | undefined): string | null {
  if (!state) return null;
  const normalized = normalize(state).replace(/^(state of|estado de|estado do|estado da)\s+/, '');
  if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return STATE_NAME_TO_UF[normalized] ?? null;
}

interface GeoDirectResult {
  name?: string;
  lat?: number;
  lon?: number;
  country?: string;
  state?: string;
}

/**
 * Cidade brasileira → coordenadas + UF (Geocoding API do OpenWeatherMap, a
 * mesma chave do clima). `uf` opcional desempata homônimas (ex.: "Santa
 * Luzia" existe em vários estados). Null quando não acha, a chave não está
 * configurada ou a API falha — quem chama decide o que dizer à pessoa.
 */
export async function geocodeBrazilianCity(city: string, uf?: string): Promise<GeocodedCity | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)},BR&limit=5&appid=${apiKey}`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
    if (!response.ok) {
      logger.error('geocoding_http_error', { status: response.status });
      return null;
    }

    const results = ((await response.json()) as GeoDirectResult[]).filter(
      (result) => result.country === 'BR' && typeof result.lat === 'number' && typeof result.lon === 'number',
    );
    const wantedUf = uf?.toUpperCase();
    const match = wantedUf ? results.find((result) => stateToUf(result.state) === wantedUf) : results[0];
    const resolvedUf = match ? stateToUf(match.state) : null;
    if (!match || !resolvedUf) return null;

    return { city: match.name ?? city, uf: resolvedUf, latitude: match.lat!, longitude: match.lon! };
  } catch (error) {
    logger.error('geocoding_failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
