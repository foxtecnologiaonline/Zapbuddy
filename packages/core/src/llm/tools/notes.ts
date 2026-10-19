import { z } from 'zod';
import { createNote, deleteNote, listNotes } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const createNoteTool = defineTool({
  name: 'create_note',
  description:
    'Cria uma nota pessoal livre pra pessoa, sem data e sem conceito de "concluir" (diferente de ' +
    'tarefa — use create_task quando é algo a fazer). Use quando a pessoa pedir explicitamente pra ' +
    'anotar algo ("anota aí: ...", "guarda isso pra mim") sem que seja um compromisso/ação.',
  schema: z.object({
    content: z.string().min(1).max(2000),
  }),
  execute: async (params, ctx) => {
    const note = await createNote(ctx.accountId, ctx.userId, params.content);
    return { note_id: note.id, created: true };
  },
});

export const listNotesTool = defineTool({
  name: 'list_notes',
  description:
    'Lista as notas pessoais da pessoa, mais recentes primeiro. Passe query pra buscar só notas que ' +
    'contenham um termo (ex.: "o que eu anotei sobre o aluguel" → query: "aluguel") — sem query, lista ' +
    'tudo.',
  schema: z.object({
    query: z.string().min(1).max(200).optional(),
  }),
  execute: async (params, ctx) => {
    const notes = await listNotes(ctx.accountId, undefined, params.query);
    return { notes };
  },
});

export const deleteNoteTool = defineTool({
  name: 'delete_note',
  description:
    'Exclui definitivamente uma nota pessoal, dado o note_id — use quando a pessoa não quer mais ' +
    'aquela nota. Se o note_id não existir mais nessa conta, retorna deleted: false.',
  schema: z.object({
    note_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const note = await deleteNote(ctx.accountId, params.note_id);
    return note ? { deleted: true, note_id: note.id } : { deleted: false };
  },
});
