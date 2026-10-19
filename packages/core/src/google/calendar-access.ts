import { getCalendarConnection } from '@zapbuddy/db';
import { decryptSecret } from '../security/crypto.js';
import { refreshGoogleAccessToken } from './oauth.js';
import { listGoogleCalendarEvents } from './calendar.js';
import { getTodayRange } from '../time/zoned-ranges.js';

/** Sem cache de access token (ADR 0002, decisão 3) — sempre renova via refresh token antes de cada chamada. */
export async function getFreshCalendarAccess(accountId: string): Promise<{ accessToken: string; calendarId: string } | null> {
  const connection = await getCalendarConnection(accountId);
  if (!connection) return null;

  const refreshToken = decryptSecret(connection.google_refresh_token_encrypted);
  const { accessToken } = await refreshGoogleAccessToken(refreshToken);
  return { accessToken, calendarId: connection.google_calendar_id };
}

function formatHourInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Linhas "HH:MM Título" dos eventos de hoje no fuso da pessoa; vazio quando não há agenda conectada. */
export async function getTodayAgendaLines(accountId: string, timeZone: string): Promise<string[]> {
  const access = await getFreshCalendarAccess(accountId);
  if (!access) return [];

  const range = getTodayRange(timeZone);
  const events = await listGoogleCalendarEvents(access.accessToken, access.calendarId, range.startIso, range.endIso);
  return events.map((event) => `${formatHourInZone(event.startIso, timeZone)} ${event.summary}`);
}
