import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { fetchMarketRate, MARKET_INDICATORS, type MarketIndicator } from '../../markets/bcb.js';
import { localDateKey } from '../../habits/streak.js';

const INDICATORS = Object.keys(MARKET_INDICATORS) as [MarketIndicator, ...MarketIndicator[]];

export const getMarketRateTool = defineTool({
  name: 'get_market_rate',
  description:
    'Cotação e juros oficiais do Banco Central: dólar (usd), euro (eur), libra (gbp), meta Selic (selic), CDI ' +
    '(cdi), IPCA do mês (ipca) e IPCA em 12 meses (ipca_12m). Use pra "quanto tá o dólar", "quanto tá a Selic", ' +
    '"qual a inflação". Câmbio é a taxa de venda do dia de referência (reference_date) — NÃO é cotação ao vivo ' +
    'nem a de casa de câmbio/cartão: diga isso de forma natural. Selic e CDI são % ao ano. Não cobre cripto, ' +
    'ações nem outras moedas (use web_search com reason current_info). Se vier available: false, diga que não ' +
    'conseguiu checar agora — nunca chute o número.',
  schema: z.object({
    indicator: z.enum(INDICATORS),
  }),
  execute: async (params, ctx) => {
    const rate = await fetchMarketRate(params.indicator, localDateKey(ctx.timezone));
    if (!rate) return { available: false };
    return {
      available: true,
      indicator: rate.indicator,
      label: rate.label,
      value: rate.value,
      unit: rate.unit,
      reference_date: rate.referenceDate,
      source: rate.source,
    };
  },
});
