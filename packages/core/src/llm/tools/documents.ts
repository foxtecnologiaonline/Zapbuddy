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
    'Procura arquivos/imagens enviados, por nome, legenda, CONTEÚDO lido e significado (match:"related" = só parecido, trate como possível). Cada resultado traz o que foi lido (summary, extracted: tipo, estabelecimento, valor, datas): responda só com isso, nunca complete de cabeça. summary:null = sem leitura. Sem query, os mais recentes.',
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
