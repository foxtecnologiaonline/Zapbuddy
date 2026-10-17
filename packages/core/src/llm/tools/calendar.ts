import { z } from 'zod';
import { getCalendarConnection } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { decryptSecret } from '../../security/crypto.js';
import { refreshGoogleAccessToken } from '../../google/oauth.js';
import { createGoogleCalendarEvent, listGoogleCalendarEvents } from '../../google/calendar.js';
import { getTodayRange, getLast7DaysRange } from '../../time/zoned-ranges.js';

/** Sem cache de access token (ADR 0002, decisão 3) — sempre renova via refresh token antes de cada chamada. */
async function getFreshAccessToken(accountId: string): Promise<{ accessToken: string; calendarId: string } | null> {
  const connection = await getCalendarConnection(accountId);
  if (!connection) return null;

  const refreshToken = decryptSecret(connection.google_refresh_token_encrypted);
  const { accessToken } = await refreshGoogleAccessToken(refreshToken);
  return { accessToken, calendarId: connection.google_calendar_id };
}

export const createCalendarEventTool = defineTool({
  name: 'create_calendar_event',
  description:
    'Cria um evento no Google Agenda conectado da conta. Exige que a conta já tenha conectado o Google ' +
    'Agenda pelo dashboard (send_dashboard_login_link) — se connected:false vier no retorno, diga à pessoa ' +
    'que ela precisa conectar o Google Agenda no painel antes.',
  schema: z.object({
    summary: z.string().min(1),
    start_at: z.string().datetime(),
    end_at: z.string().datetime(),
    description: z.string().optional(),
  }),
  execute: async (params, ctx) => {
    const auth = await getFreshAccessToken(ctx.accountId);
    if (!auth) return { connected: false };

    const event = await createGoogleCalendarEvent(auth.accessToken, auth.calendarId, {
      summary: params.summary,
      startIso: params.start_at,
      endIso: params.end_at,
      description: params.description,
    });
    return { connected: true, created: true, event_id: event.id, html_link: event.htmlLink };
  },
});

export const listCalendarEventsTool = defineTool({
  name: 'list_calendar_events',
  description: "Lista eventos do Google Agenda conectado da conta: 'today' (hoje) ou 'last_7_days' (próximos/últimos 7 dias).",
  schema: z.object({
    period: z.enum(['today', 'last_7_days']),
  }),
  execute: async (params, ctx) => {
    const auth = await getFreshAccessToken(ctx.accountId);
    if (!auth) return { connected: false };

    const range = params.period === 'today' ? getTodayRange(ctx.timezone) : getLast7DaysRange(ctx.timezone);
    const events = await listGoogleCalendarEvents(auth.accessToken, auth.calendarId, range.startIso, range.endIso);
    return { connected: true, events };
  },
});
