import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { searchWeb } from '../web-search/client.js';

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Busca informação na web. Use pra: (1) dúvida geral que você não tem certeza de saber ou que pode ter mudado ' +
    '(reason: general_question — ex.: "o que é o MEI", "taxa do Simples Nacional esse ano", horário/endereço de ' +
    'um lugar); (2) o que muda no dia — notícia, resultado de jogo, evento, cotação de cripto/ação, lançamento ' +
    '(reason: current_info; só aceita cache de poucos minutos e olha notícias dos últimos dias); (3) identificar ' +
    'um estabelecimento desconhecido ANTES de escolher a categoria de um gasto (reason: categorization_support). ' +
    'Previsão do tempo, dólar/euro/libra, Selic, CDI e IPCA têm tool própria (get_weather, get_market_rate) — ' +
    'prefira essas. Nunca use pra confirmar ou inventar valor/data de transação: isso vem só do que a pessoa ' +
    'disse. Cite de onde veio quando for informação atual e deixe claro a data que a fonte informa.',
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
