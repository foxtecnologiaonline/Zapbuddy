import { getCalendarConnection } from '@zapbuddy/db';
import { decryptSecret } from '../security/crypto.js';
import { getTodayRange } from '../time/zoned-ranges.js';
import {
  refreshGoogleAccessToken,
  createGoogleCalendarEvent,
  listGoogleCalendarEvents,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from './providers/google.js';
import {
  refreshMicrosoftAccessToken,
  createMicrosoftCalendarEvent,
  listMicrosoftCalendarEvents,
  deleteMicrosoftCalendarEvent,
  updateMicrosoftCalendarEvent,
} from './providers/microsoft.js';
import type { CalendarEventInput, CalendarEventPatch, CreatedCalendarEvent, CalendarEventSummary, CalendarProviderName } from './types.js';

export interface CalendarAccess {
  accessToken: string;
  calendarId: string;
  provider: CalendarProviderName;
}

/**
 * Sem cache de access token (ver ADR 0002, decisão 3) — sempre renova via
 * refresh token antes de cada chamada. Despacha pro provider certo
 * (`connection.provider`) — único lugar do código que precisa saber qual
 * provider está conectado; create/list/delete abaixo também despacham
 * internamente, então o resto do projeto (tools, undo, resumo matinal) só
 * lida com estas funções genéricas, nunca com Google/Microsoft diretamente.
 */
export async function getFreshCalendarAccess(accountId: string): Promise<CalendarAccess | null> {
  const connection = await getCalendarConnection(accountId);
  if (!connection) return null;

  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const { accessToken } =
    connection.provider === 'microsoft' ? await refreshMicrosoftAccessToken(refreshToken) : await refreshGoogleAccessToken(refreshToken);
  return { accessToken, calendarId: connection.calendar_id, provider: connection.provider };
}

export async function createCalendarEvent(access: CalendarAccess, input: CalendarEventInput): Promise<CreatedCalendarEvent> {
  return access.provider === 'microsoft'
    ? createMicrosoftCalendarEvent(access.accessToken, access.calendarId, input)
    : createGoogleCalendarEvent(access.accessToken, access.calendarId, input);
}

export async function listCalendarEvents(access: CalendarAccess, fromIso: string, toIso: string): Promise<CalendarEventSummary[]> {
  return access.provider === 'microsoft'
    ? listMicrosoftCalendarEvents(access.accessToken, access.calendarId, fromIso, toIso)
    : listGoogleCalendarEvents(access.accessToken, access.calendarId, fromIso, toIso);
}

export async function deleteCalendarEvent(access: CalendarAccess, eventId: string): Promise<void> {
  return access.provider === 'microsoft'
    ? deleteMicrosoftCalendarEvent(access.accessToken, access.calendarId, eventId)
    : deleteGoogleCalendarEvent(access.accessToken, access.calendarId, eventId);
}

export async function updateCalendarEvent(access: CalendarAccess, eventId: string, patch: CalendarEventPatch): Promise<CreatedCalendarEvent> {
  return access.provider === 'microsoft'
    ? updateMicrosoftCalendarEvent(access.accessToken, access.calendarId, eventId, patch)
    : updateGoogleCalendarEvent(access.accessToken, access.calendarId, eventId, patch);
}

export interface TodayAgendaEvent {
  startIso: string;
  title: string;
}

/** Eventos de hoje (fuso da pessoa) em ordem de horário; vazio quando não há agenda conectada. */
export async function getTodayAgendaEvents(accountId: string, timeZone: string): Promise<TodayAgendaEvent[]> {
  const access = await getFreshCalendarAccess(accountId);
  if (!access) return [];

  const range = getTodayRange(timeZone);
  const events = await listCalendarEvents(access, range.startIso, range.endIso);
  return events
    .map((event) => ({ startIso: event.startIso, title: event.summary }))
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
}
