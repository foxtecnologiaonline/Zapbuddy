import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { createCalendarEvent, listCalendarEvents, getFreshCalendarAccess } from '../../calendar/calendar-access.js';
import type { CalendarEventSummary } from '../../calendar/types.js';
import { getTodayRange, getLast7DaysRange } from '../../time/zoned-ranges.js';

export const createCalendarEventTool = defineTool({
  name: 'create_calendar_event',
  description:
    'Cria um evento na agenda conectada da conta (Google ou Outlook). Exige que a conta já tenha conectado ' +
    'uma agenda pelo dashboard (send_dashboard_login_link) — se connected:false vier no retorno, diga à ' +
    'pessoa que ela precisa conectar a agenda no painel antes.',
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
  description: "Lista eventos da agenda conectada da conta (Google ou Outlook): 'today' (hoje) ou 'last_7_days' (próximos/últimos 7 dias).",
  schema: z.object({
    period: z.enum(['today', 'last_7_days']),
  }),
  execute: async (params, ctx) => {
    const access = await getFreshCalendarAccess(ctx.accountId);
    if (!access) return { connected: false };

    const range = params.period === 'today' ? getTodayRange(ctx.timezone) : getLast7DaysRange(ctx.timezone);
    const events = await listCalendarEvents(access, range.startIso, range.endIso);
    return { connected: true, events };
  },
});
