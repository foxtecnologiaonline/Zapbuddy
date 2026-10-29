import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { fetchMarketRate, MARKET_INDICATORS, type MarketIndicator } from '../../markets/bcb.js';
import { localDateKey } from '../../habits/streak.js';

const INDICATORS = Object.keys(MARKET_INDICATORS) as [MarketIndicator, ...MarketIndicator[]];

export const getMarketRateTool = defineTool({
  name: 'get_market_rate',
  description:
    'Dados oficiais do Banco Central: usd, eur, gbp (venda do dia de referência — NÃO é cotação ao vivo nem de casa de câmbio), selic e cdi (% ao ano), ipca e ipca_12m. Não cobre cripto/ações (web_search current_info). available:false → diga que não conseguiu checar, nunca chute.',
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
