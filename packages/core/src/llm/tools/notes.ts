import { z } from 'zod';
import { createNote, deleteNote, listNotes, searchNotesBySimilarity, updateNote } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { embedText } from '../embeddings/client.js';
import { mergeHybridResults, SEMANTIC_MIN_SIMILARITY, SEMANTIC_RELATED_LIMIT } from '../../search/hybrid.js';

export const createNoteTool = defineTool({
  name: 'create_note',
  description:
    'Cria uma nota livre, sem data nem "concluir", quando ela pede pra anotar ("anota aí", "guarda isso"). Algo a fazer é create_task.',
  schema: z.object({
    content: z.string().min(1).max(2000),
  }),
  execute: async (params, ctx) => {
    // Vetor é bônus (busca por significado): sem chave/com falha da OpenAI a nota é salva do mesmo jeito.
    const note = await createNote(ctx.accountId, ctx.userId, params.content, await embedText(params.content));
    return { note_id: note.id, created: true };
  },
});

export const listNotesTool = defineTool({
  name: 'list_notes',
  description:
    'Notas, mais recentes primeiro. Com query: match "exact" (contém o termo) e "related" (parecido em assunto; trate como possível). Sem query, todas.',
  schema: z.object({
    query: z.string().min(1).max(200).optional(),
  }),
  execute: async (params, ctx) => {
    if (!params.query) {
      return { notes: await listNotes(ctx.accountId) };
    }

    const queryEmbedding = await embedText(params.query);
    const [exact, related] = await Promise.all([
      listNotes(ctx.accountId, undefined, params.query),
      queryEmbedding ? searchNotesBySimilarity(ctx.accountId, queryEmbedding, SEMANTIC_RELATED_LIMIT, SEMANTIC_MIN_SIMILARITY) : [],
    ]);
    const merged = mergeHybridResults(exact, related, 20);
    return {
      notes: merged.map(({ item, match }) => ({ id: item.id, content: item.content, created_at: item.created_at, match })),
    };
  },
});

export const deleteNoteTool = defineTool({
  name: 'delete_note',
  description:
    'Exclui uma nota (note_id). deleted:false se não existe.',
  schema: z.object({
    note_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const note = await deleteNote(ctx.accountId, params.note_id);
    return note ? { deleted: true, note_id: note.id } : { deleted: false };
  },
});

export const updateNoteTool = defineTool({
  name: 'update_note',
  description:
    'Reescreve uma nota (note_id de list_notes) com o texto COMPLETO novo. updated:false se não existe.',
  schema: z.object({
    note_id: z.string().uuid(),
    content: z.string().min(1).max(2000),
  }),
  execute: async (params, ctx) => {
    const note = await updateNote(ctx.accountId, params.note_id, params.content, await embedText(params.content));
    return note ? { updated: true, note_id: note.id } : { updated: false };
  },
});
