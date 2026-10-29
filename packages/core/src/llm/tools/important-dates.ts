import { z } from 'zod';
import { createImportantDate, deleteImportantDate, listImportantDates } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const rememberImportantDateTool = defineTool({
  name: 'remember_important_date',
  description:
    'Guarda data que se repete todo ano (aniversário): você avisa sozinho no dia. "aniversário da mãe, 15 de março" → label, month 3, day 15. Evento único é create_calendar_event.',
  schema: z.object({
    label: z.string().min(1).max(200),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
  execute: async (params, ctx) => {
    const importantDate = await createImportantDate(ctx.accountId, ctx.userId, params.label, params.month, params.day);
    return { important_date_id: importantDate.id, remembered: true };
  },
});

export const listImportantDatesTool = defineTool({
  name: 'list_important_dates',
  description: 'Lista as datas importantes guardadas pra essa conta (aniversários, datas comemorativas).',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const importantDates = await listImportantDates(ctx.accountId);
    return { important_dates: importantDates };
  },
});

export const forgetImportantDateTool = defineTool({
  name: 'forget_important_date',
  description:
    'Esquece uma data importante (important_date_id).',
  schema: z.object({
    important_date_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const importantDate = await deleteImportantDate(ctx.accountId, params.important_date_id);
    return importantDate ? { forgotten: true, important_date_id: importantDate.id } : { forgotten: false };
  },
});
