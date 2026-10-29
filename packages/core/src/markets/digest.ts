import { MARKET_INDICATORS, type MarketIndicator, type MarketRate } from './bcb.js';

/**
 * Indicadores econômicos no bom dia: mensagem à parte, só com o que a pessoa
 * escolheu, e a oferta única de "quer receber?". Texto fixo e números do Banco
 * Central — nada de LLM, nada estimado. Indicador que a fonte não trouxe sai da
 * mensagem (e se nenhum veio, a mensagem não sai): nunca um número inventado.
 */

export interface IndicatorChoice {
  code: MarketIndicator;
  emoji: string;
  /** Nome curto, como a pessoa fala. */
  label: string;
}

/** Ordem de exibição, e fonte única da lista oferecida (o schema da tool usa estes mesmos códigos). */
export const INDICATOR_CHOICES: IndicatorChoice[] = [
  { code: 'usd', emoji: '💵', label: 'Dólar' },
  { code: 'eur', emoji: '💶', label: 'Euro' },
  { code: 'gbp', emoji: '💷', label: 'Libra' },
  { code: 'selic', emoji: '🏦', label: 'Selic (meta)' },
  { code: 'cdi', emoji: '📈', label: 'CDI' },
  { code: 'ipca', emoji: '🧾', label: 'IPCA do mês' },
  { code: 'ipca_12m', emoji: '🧮', label: 'IPCA em 12 meses' },
];

export const INDICATOR_CODES = INDICATOR_CHOICES.map((choice) => choice.code) as [MarketIndicator, ...MarketIndicator[]];

const VALID_CODES = new Set<string>(Object.keys(MARKET_INDICATORS));

/** Só códigos conhecidos, sem repetição, na ordem de exibição (lixo vindo do banco não quebra a mensagem). */
export function normalizeIndicatorSelection(codes: readonly string[]): MarketIndicator[] {
  const wanted = new Set(codes.filter((code) => VALID_CODES.has(code)));
  return INDICATOR_CHOICES.filter((choice) => wanted.has(choice.code)).map((choice) => choice.code);
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatNumber(value: number, digits: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function dayMonth(referenceDate: string): string {
  const [, month, day] = referenceDate.split('-');
  return `${day}/${month}`;
}

function formatLine(rate: MarketRate, choice: IndicatorChoice): string {
  switch (rate.indicator) {
    case 'usd':
    case 'eur':
    case 'gbp':
      return `${choice.emoji} ${choice.label}: R$ ${formatNumber(rate.value, 2)} (fechamento de ${dayMonth(rate.referenceDate)})`;
    case 'selic':
      return `${choice.emoji} ${choice.label}: ${formatNumber(rate.value, 2)}% ao ano`;
    case 'cdi':
      return `${choice.emoji} ${choice.label}: ${formatNumber(rate.value, 2)}% ao ano (de ${dayMonth(rate.referenceDate)})`;
    case 'ipca': {
      const month = MONTHS_PT[Number(rate.referenceDate.slice(5, 7)) - 1] ?? rate.referenceDate.slice(5, 7);
      return `${choice.emoji} ${choice.label}: ${formatNumber(rate.value, 2)}% (${month}/${rate.referenceDate.slice(0, 4)})`;
    }
    case 'ipca_12m':
      return `${choice.emoji} ${choice.label}: ${formatNumber(rate.value, 2)}%`;
  }
}

const FX = new Set<MarketIndicator>(['usd', 'eur', 'gbp']);

/** A mensagem diária de indicadores; null quando nenhum valor veio (melhor não mandar que mandar vazio). */
export function formatIndicatorsMessage(rates: MarketRate[]): string | null {
  const byCode = new Map(rates.map((rate) => [rate.indicator, rate]));
  const lines = INDICATOR_CHOICES.flatMap((choice) => {
    const rate = byCode.get(choice.code);
    return rate ? [formatLine(rate, choice)] : [];
  });
  if (lines.length === 0) return null;

  const hasFx = rates.some((rate) => FX.has(rate.indicator));
  return [
    '📊 *Indicadores de hoje*',
    ...lines,
    hasFx ? 'Câmbio é a taxa de venda do Banco Central no último fechamento, não a cotação ao vivo nem a da casa de câmbio.' : 'Dados oficiais do Banco Central.',
  ].join('\n');
}

/** A oferta única: lista o que dá pra incluir e pergunta se a pessoa quer. */
export function formatIndicatorsOffer(): string {
  return [
    '📊 *Quer indicadores econômicos no bom dia?*',
    'Posso mandar, logo depois do bom dia, os números do dia. Dá pra escolher entre:',
    ...INDICATOR_CHOICES.map((choice) => `${choice.emoji} ${choice.label}`),
    '',
    'Se quiser, me diz quais (ou "todos") que a partir de amanhã eles chegam junto do bom dia. Se não quiser, é só ignorar: não pergunto de novo.',
  ].join('\n');
}

export function describeIndicatorSelection(codes: readonly string[]): string {
  const labels = normalizeIndicatorSelection(codes).map((code) => INDICATOR_CHOICES.find((choice) => choice.code === code)!.label);
  return labels.join(', ');
}
