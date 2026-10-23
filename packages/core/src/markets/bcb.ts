import { logger } from '@zapbuddy/db';
import { fetchWithRetry } from '../whatsapp/http-retry.js';

/**
 * Câmbio e juros oficiais pelo SGS do Banco Central (api.bcb.gov.br) — dado
 * público, sem chave e sem restrição de uso comercial, e de fonte primária:
 * pergunta de "quanto tá o dólar / a Selic" não passa por busca na web nem
 * por memória do modelo (CLAUDE.md: nunca inventar dado financeiro).
 *
 * Honestidade sobre o que NÃO é: câmbio aqui é a taxa de venda do dia de
 * referência (fechamento do boletim do BC), não cotação ao vivo nem a de
 * casa de câmbio/cartão; o `reference_date` vai junto pra o Tom dizer isso.
 */
export const MARKET_INDICATORS = {
  usd: { series: 1, label: 'Dólar comercial (venda)', unit: 'R$' },
  eur: { series: 21619, label: 'Euro (venda)', unit: 'R$' },
  gbp: { series: 21623, label: 'Libra esterlina (venda)', unit: 'R$' },
  selic: { series: 432, label: 'Meta da taxa Selic', unit: '% ao ano' },
  cdi: { series: 4389, label: 'Taxa CDI', unit: '% ao ano' },
  ipca: { series: 433, label: 'IPCA do mês (variação mensal)', unit: '%' },
  ipca_12m: { series: 13522, label: 'IPCA acumulado em 12 meses', unit: '%' },
} as const;

export type MarketIndicator = keyof typeof MARKET_INDICATORS;

export interface MarketRate {
  indicator: MarketIndicator;
  label: string;
  value: number;
  unit: string;
  /** Data (YYYY-MM-DD) a que o valor se refere — IPCA mensal vem como 1º dia do mês. */
  referenceDate: string;
  source: string;
}

interface BcbRow {
  data: string; // dd/mm/yyyy
  valor: string;
}

export function parseBcbDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/**
 * Última observação cuja data já chegou. A série da Selic (432) publica a
 * meta com data de início de vigência, que pode ser futura — pega só o que
 * já vale hoje. Pura, testável sem rede.
 */
export function pickLatestRate(rows: BcbRow[], todayKey: string): { value: number; referenceDate: string } | null {
  const parsed = rows
    .map((row) => ({ referenceDate: parseBcbDate(row.data), value: Number(row.valor) }))
    .filter((row): row is { referenceDate: string; value: number } => row.referenceDate !== null && Number.isFinite(row.value))
    .filter((row) => row.referenceDate <= todayKey)
    .sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  return parsed.at(-1) ?? null;
}

/** Null (nunca lança) em qualquer falha — quem chama diz "não consegui checar agora" em vez de chutar. */
export async function fetchMarketRate(indicator: MarketIndicator, todayKey: string): Promise<MarketRate | null> {
  const config = MARKET_INDICATORS[indicator];
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${config.series}/dados/ultimos/5?formato=json`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 8_000);
    if (!response.ok) {
      logger.error('bcb_series_http_error', { indicator, status: response.status });
      return null;
    }
    const latest = pickLatestRate((await response.json()) as BcbRow[], todayKey);
    if (!latest) return null;
    return {
      indicator,
      label: config.label,
      value: latest.value,
      unit: config.unit,
      referenceDate: latest.referenceDate,
      source: 'Banco Central do Brasil (SGS)',
    };
  } catch (error) {
    logger.error('bcb_series_failed', { indicator, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
