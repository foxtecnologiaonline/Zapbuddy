import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { searchWeb } from '../web-search/client.js';

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Busca informação na web. Use pra responder dúvida geral que não é financeira/tarefa ' +
    '(ex.: "o que é o MEI", "taxa do Simples Nacional esse ano") e pra identificar um ' +
    'estabelecimento desconhecido ANTES de escolher a categoria de um gasto, quando o nome ' +
    'sozinho não deixa óbvio o tipo de negócio. Nunca use pra confirmar ou inventar valor/data ' +
    'de transação — isso continua vindo só do que a pessoa disse, nunca de uma busca.',
  schema: z.object({
    query: z.string().min(1),
    reason: z
      .enum(['general_question', 'categorization_support'])
      .describe('Por que está buscando: dúvida geral da pessoa, ou apoio pra categorizar um gasto.'),
  }),
  execute: async (params, ctx) => {
    const origin = params.reason === 'categorization_support' ? 'categorization' : 'user_query';
    const result = await searchWeb(params.query, { origin, userId: ctx.userId });
    return {
      summary: result.summary,
      source_urls: result.sourceUrls,
      from_cache: result.fromCache,
    };
  },
});
