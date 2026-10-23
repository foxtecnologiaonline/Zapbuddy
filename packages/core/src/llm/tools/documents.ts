import { z } from 'zod';
import {
  listRecentDocuments,
  searchDocuments,
  searchDocumentsBySimilarity,
  withSignedUrls,
  type DocumentWithUrl,
  type RelatedDocument,
} from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { embedText } from '../embeddings/client.js';
import { mergeHybridResults, SEMANTIC_MIN_SIMILARITY, SEMANTIC_RELATED_LIMIT, type MatchKind } from '../../search/hybrid.js';

export const findDocumentTool = defineTool({
  name: 'find_document',
  description:
    'Procura documentos/imagens que a pessoa já mandou. Acha por nome do arquivo, pela legenda e pelo CONTEÚDO ' +
    'que o Tom leu no arquivo (ex.: "aquele comprovante do mercado", "o boleto da luz") — e também por ' +
    'significado (match: "related" é só parecido, trate como possível). Cada resultado traz o que foi lido ' +
    '(summary e extracted: tipo, estabelecimento, valor, datas), então dá pra responder "quanto foi aquele ' +
    'comprovante" sem reabrir o arquivo — mas só com o que veio aqui, nunca complete de cabeça. Arquivos ' +
    'antigos ou de tipo não suportado podem não ter leitura (summary: null). Sem "query", retorna os mais recentes.',
  schema: z.object({
    query: z.string().min(1).optional(),
  }),
  execute: async (params, ctx) => {
    if (!params.query) {
      return { documents: (await listRecentDocuments(ctx.accountId)).map((doc) => describeDocument(doc, 'exact')) };
    }

    const queryEmbedding = await embedText(params.query);
    const [exact, related] = await Promise.all([
      searchDocuments(ctx.accountId, params.query),
      queryEmbedding ? searchDocumentsBySimilarity(ctx.accountId, queryEmbedding, SEMANTIC_RELATED_LIMIT, SEMANTIC_MIN_SIMILARITY) : [],
    ]);
    const merged = mergeHybridResults(exact, related, 10);

    // Link assinado só dos relacionados que entraram (os exatos já vêm assinados) — assinar custa uma chamada ao Storage por arquivo.
    const relatedToSign = merged.filter((entry) => entry.match === 'related').map((entry) => entry.item as RelatedDocument);
    const signedRelated = new Map((relatedToSign.length > 0 ? await withSignedUrls(relatedToSign) : []).map((doc) => [doc.id, doc]));

    return {
      documents: merged.map(({ item, match }) => describeDocument(match === 'related' ? signedRelated.get(item.id)! : (item as DocumentWithUrl), match)),
    };
  },
});

function describeDocument(doc: DocumentWithUrl, match: MatchKind) {
  return {
    file_name: doc.file_name,
    caption: doc.caption,
    created_at: doc.created_at,
    download_url: doc.download_url,
    summary: doc.extracted_text,
    extracted: doc.extracted_data,
    match,
  };
}
