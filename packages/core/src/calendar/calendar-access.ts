import { getCalendarConnection } from '@zapbuddy/db';
import { decryptSecret } from '../security/crypto.js';
import { getTodayRange } from '../time/zoned-ranges.js';
import { refreshGoogleAccessToken, createGoogleCalendarEvent, listGoogleCalendarEvents, deleteGoogleCalendarEvent } from './providers/google.js';
import {
  refreshMicrosoftAccessToken,
  createMicrosoftCalendarEvent,
  listMicrosoftCalendarEvents,
  deleteMicrosoftCalendarEvent,
} from './providers/microsoft.js';
import type { CalendarEventInput, CreatedCalendarEvent, CalendarEventSummary, CalendarProviderName } from './types.js';

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

function formatHourInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Linhas "HH:MM Título" dos eventos de hoje no fuso da pessoa; vazio quando não há agenda conectada. */
export async function getTodayAgendaLines(accountId: string, timeZone: string): Promise<string[]> {
  const access = await getFreshCalendarAccess(accountId);
  if (!access) return [];

  const range = getTodayRange(timeZone);
  const events = await listCalendarEvents(access, range.startIso, range.endIso);
  return events.map((event) => `${formatHourInZone(event.startIso, timeZone)} ${event.summary}`);
}
