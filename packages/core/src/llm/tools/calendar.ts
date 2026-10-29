import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import {
  createCalendarEvent,
  listCalendarEvents,
  getFreshCalendarAccess,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '../../calendar/calendar-access.js';
import type { CalendarEventSummary } from '../../calendar/types.js';
import { getTodayRange, getLast7DaysRange, getTomorrowRange, getNext7DaysRange, getDateKeyRange } from '../../time/zoned-ranges.js';
import { assertPlausibleTimestamp } from '../date-sanity.js';

export const createCalendarEventTool = defineTool({
  name: 'create_calendar_event',
  description:
    'Cria evento na agenda conectada (Google/Outlook). connected:false = agenda não conectada: siga as instruções do sistema, sem tentar de novo na mesma resposta.',
  schema: z.object({
    summary: z.string().min(1),
    start_at: z.string().datetime(),
    end_at: z.string().datetime(),
    description: z.string().optional(),
  }),
  execute: async (params, ctx) => {
    const access = await getFreshCalendarAccess(ctx.accountId);
    if (!access) return { connected: false };

    // O provider devolve só eventos que se sobrepõem à janela pedida, então
    // qualquer item aqui é um conflito. Não bloqueia: a pessoa pode querer
    // marcar mesmo assim.
    const overlapping = await listCalendarEvents(access, params.start_at, params.end_at);

    const event = await createCalendarEvent(access, {
      summary: params.summary,
      startIso: params.start_at,
      endIso: params.end_at,
      description: params.description,
    });
    return {
      connected: true,
      created: true,
      event_id: event.id,
      html_link: event.htmlLink,
      conflicts: overlapping.map((item: CalendarEventSummary) => ({ summary: item.summary, start_at: item.startIso })),
    };
  },
});

export const listCalendarEventsTool = defineTool({
  name: 'list_calendar_events',
  description:
    'Eventos da agenda conectada. period: \'today\', \'tomorrow\', \'next_7_days\' ou \'last_7_days\' (passado). Data/intervalo específico: from_date e to_date (YYYY-MM-DD locais) no lugar de period. Cada evento traz event_id (pra update/delete).',
  schema: z
    .object({
      period: z.enum(['today', 'tomorrow', 'next_7_days', 'last_7_days']).optional(),
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .refine((value) => value.period !== undefined || (value.from_date !== undefined && value.to_date !== undefined), {
      message: 'Informe period, ou from_date e to_date juntos.',
    }),
  execute: async (params, ctx) => {
    const access = await getFreshCalendarAccess(ctx.accountId);
    if (!access) return { connected: false };

    let range;
    if (params.from_date && params.to_date) {
      range = getDateKeyRange(ctx.timezone, params.from_date, params.to_date);
    } else if (params.period === 'tomorrow') {
      range = getTomorrowRange(ctx.timezone);
    } else if (params.period === 'next_7_days') {
      range = getNext7DaysRange(ctx.timezone);
    } else if (params.period === 'last_7_days') {
      range = getLast7DaysRange(ctx.timezone);
    } else {
      range = getTodayRange(ctx.timezone);
    }
    const events = await listCalendarEvents(access, range.startIso, range.endIso);
    return {
      connected: true,
      events: events.map((event) => ({ event_id: event.id, summary: event.summary, start_at: event.startIso, end_at: event.endIso })),
    };
  },
});

export const updateCalendarEventTool = defineTool({
  name: 'update_calendar_event',
  description:
    'Altera um evento (event_id de list_calendar_events): título, descrição ou horário (start_at E end_at juntos). Só o que muda. NUNCA crie outro pra remarcar. connected:false = sem agenda; conflicts = colide com outro evento.',
  schema: z
    .object({
      event_id: z.string().min(1),
      summary: z.string().min(1).optional(),
      description: z.string().optional(),
      start_at: z.string().datetime().optional(),
      end_at: z.string().datetime().optional(),
    })
    .refine((value) => (value.start_at === undefined) === (value.end_at === undefined), {
      message: 'Pra mudar o horário, informe start_at e end_at juntos.',
    })
    .refine((value) => value.summary !== undefined || value.description !== undefined || value.start_at !== undefined, {
      message: 'Informe ao menos um campo pra alterar (summary, description ou o horário).',
    }),
  execute: async (params, ctx) => {
    if (params.start_at && params.end_at) {
      assertPlausibleTimestamp(params.start_at, 'start_at');
      assertPlausibleTimestamp(params.end_at, 'end_at');
      if (new Date(params.end_at).getTime() <= new Date(params.start_at).getTime()) {
        throw new Error('end_at precisa ser depois de start_at.');
      }
    }

    const access = await getFreshCalendarAccess(ctx.accountId);
    if (!access) return { connected: false };

    let conflicts: Array<{ summary: string; start_at: string }> = [];
    if (params.start_at && params.end_at) {
      const overlapping = await listCalendarEvents(access, params.start_at, params.end_at);
      conflicts = overlapping
        .filter((item: CalendarEventSummary) => item.id !== params.event_id)
        .map((item) => ({ summary: item.summary, start_at: item.startIso }));
    }

    const event = await updateCalendarEvent(access, params.event_id, {
      summary: params.summary,
      description: params.description,
      startIso: params.start_at,
      endIso: params.end_at,
    });
    return { connected: true, updated: true, event_id: event.id, html_link: event.htmlLink, conflicts };
  },
});

export const deleteCalendarEventTool = defineTool({
  name: 'delete_calendar_event',
  description:
    'Remove um evento (event_id) só se ela pediu. IRREVERSÍVEL: com mais de um possível, confirme qual. connected:false = sem agenda.',
  schema: z.object({
    event_id: z.string().min(1),
  }),
  execute: async (params, ctx) => {
    const access = await getFreshCalendarAccess(ctx.accountId);
    if (!access) return { connected: false };
    await deleteCalendarEvent(access, params.event_id);
    return { connected: true, deleted: true, event_id: params.event_id };
  },
});
