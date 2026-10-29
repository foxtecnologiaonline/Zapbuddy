import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { searchWeb } from '../web-search/client.js';

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Busca na web. reason: general_question (dúvida geral que pode ter mudado), current_info (notícia, jogo, evento, cripto/ação; cache curto) ou categorization_support (identificar estabelecimento ANTES de categorizar gasto). Clima e dólar/Selic/CDI/IPCA têm tool própria (get_weather, get_market_rate). Nunca use pra inventar ou confirmar valor/data de transação. Cite a fonte e a data que ela informa.',
  schema: z.object({
    query: z.string().min(1),
    reason: z
      .enum(['general_question', 'current_info', 'categorization_support'])
      .describe('Por que está buscando: dúvida geral, informação do dia (notícia/resultado/cotação), ou apoio pra categorizar um gasto.'),
  }),
  execute: async (params, ctx) => {
    const origin = params.reason === 'categorization_support' ? 'categorization' : 'user_query';
    const result = await searchWeb(params.query, {
      origin,
      userId: ctx.userId,
      freshness: params.reason === 'current_info' ? 'current' : undefined,
    });
    return {
      summary: result.summary,
      source_urls: result.sourceUrls,
      from_cache: result.fromCache,
    };
  },
});
