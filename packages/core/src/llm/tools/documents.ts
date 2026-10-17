import { z } from 'zod';
import { listRecentDocuments, searchDocuments } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const findDocumentTool = defineTool({
  name: 'find_document',
  description:
    'Procura documentos/imagens que a pessoa já mandou, por nome do arquivo ou pela legenda que ela ' +
    'escreveu ao enviar (não procura dentro do conteúdo do arquivo). Sem "query", retorna os mais recentes.',
  schema: z.object({
    query: z.string().min(1).optional(),
  }),
  execute: async (params, ctx) => {
    const documents = params.query ? await searchDocuments(ctx.accountId, params.query) : await listRecentDocuments(ctx.accountId);
    return {
      documents: documents.map((doc) => ({
        file_name: doc.file_name,
        caption: doc.caption,
        created_at: doc.created_at,
        download_url: doc.download_url,
      })),
    };
  },
});
