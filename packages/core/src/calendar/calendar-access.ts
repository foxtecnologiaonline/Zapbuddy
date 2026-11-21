import { deleteCalendarConnection, getCalendarConnection, logger, rotateCalendarRefreshToken } from '@zapbuddy/db';
import { decryptSecret, encryptSecret } from '../security/crypto.js';
import { CalendarAuthError } from './errors.js';
import { getTodayRange, getTomorrowRange } from '../time/zoned-ranges.js';
import { localDateKey, shiftDateKey } from '../habits/streak.js';
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
  let tokens;
  try {
    tokens = connection.provider === 'microsoft' ? await refreshMicrosoftAccessToken(refreshToken) : await refreshGoogleAccessToken(refreshToken);
  } catch (error) {
    if (!(error instanceof CalendarAuthError)) throw error;
    // Token revogado ou expirado: não volta mais. Antes isso falhava em silêncio todo dia (a agenda sumia do resumo e o
    // painel seguia dizendo "Conectado"). Agora a conexão sai e a agenda passa a contar como não conectada, que é o que é.
    logger.warn('calendar_connection_revoked', { accountId, provider: connection.provider });
    await deleteCalendarConnection(accountId).catch((deleteError) =>
      logger.error('calendar_connection_delete_failed', { accountId, error: deleteError instanceof Error ? deleteError.message : String(deleteError) }),
    );
    return null;
  }

  // O Outlook rotaciona o refresh token a cada renovação. Se o novo não for gravado, o antigo expira (~90 dias) e a
  // conexão morre sozinha. Best-effort: falhar ao gravar nunca derruba a chamada de agenda em curso (o token atual segue
  // valendo até a próxima renovação, que tenta de novo).
  if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
    await rotateCalendarRefreshToken(accountId, connection.refresh_token_encrypted, encryptSecret(tokens.refreshToken)).catch((rotateError) =>
      logger.error('calendar_token_rotation_failed', { accountId, provider: connection.provider, error: rotateError instanceof Error ? rotateError.message : String(rotateError) }),
    );
  }

  return { accessToken: tokens.accessToken, calendarId: connection.calendar_id, provider: connection.provider };
}

export async function createCalendarEvent(access: CalendarAccess, input: CalendarEventInput): Promise<CreatedCalendarEvent> {
  return access.provider === 'microsoft'
    ? createMicrosoftCalendarEvent(access.accessToken, access.calendarId, input)
    : createGoogleCalendarEvent(access.accessToken, access.calendarId, input);
}

export async function listCalendarEvents(access: CalendarAccess, fromIso: string, toIso: string): Promise<CalendarEventSummary[]> {
  const events =
    access.provider === 'microsoft'
      ? await listMicrosoftCalendarEvents(access.accessToken, access.calendarId, fromIso, toIso)
      : await listGoogleCalendarEvents(access.accessToken, access.calendarId, fromIso, toIso);
  // Os provedores já pedem ordem, mas com várias páginas a garantia final é aqui (dia inteiro, só a data, ordena antes do dia).
  return [...events].sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
}

/** `false` = o evento já não existia (404/410). O "desfazer" aceita isso; a tool de apagar não pode afirmar que apagou. */
export async function deleteCalendarEvent(access: CalendarAccess, eventId: string): Promise<boolean> {
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

export interface TodayAndTomorrowAgenda {
  today: TodayAgendaEvent[];
  tomorrow: TodayAgendaEvent[];
}

/**
 * Pura: separa eventos já listados em "hoje" e "amanhã". Evento com hora vai
 * pro dia pelo instante; evento de dia inteiro (só a data, sem "T") pela data.
 * Evento que começou antes e atravessa o dia fica em "hoje" (como a listagem
 * só de hoje já fazia).
 */
export function splitAgendaByDay(events: TodayAgendaEvent[], tomorrowStartIso: string, tomorrowDateKey: string): TodayAndTomorrowAgenda {
  const tomorrowStartMs = new Date(tomorrowStartIso).getTime();
  const sorted = [...events].sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
  const result: TodayAndTomorrowAgenda = { today: [], tomorrow: [] };
  for (const event of sorted) {
    const isTomorrow = event.startIso.includes('T')
      ? new Date(event.startIso).getTime() >= tomorrowStartMs
      : event.startIso.slice(0, 10) >= tomorrowDateKey;
    (isTomorrow ? result.tomorrow : result.today).push(event);
  }
  return result;
}

/**
 * Eventos de hoje e de amanhã (fuso da pessoa) numa chamada só: o access token
 * é renovado a cada uso (ADR 0002, decisão 3, sem cache), então buscar os dois
 * dias separados custaria 2 renovações + 2 listagens por pessoa todo dia.
 * Vazio quando não há agenda conectada.
 */
export async function getTodayAndTomorrowAgendaEvents(accountId: string, timeZone: string, now: Date = new Date()): Promise<TodayAndTomorrowAgenda> {
  const access = await getFreshCalendarAccess(accountId);
  if (!access) return { today: [], tomorrow: [] };

  const today = getTodayRange(timeZone, now);
  const tomorrow = getTomorrowRange(timeZone, now);
  const events = await listCalendarEvents(access, today.startIso, tomorrow.endIso);
  return splitAgendaByDay(
    events.map((event) => ({ startIso: event.startIso, title: event.summary })),
    tomorrow.startIso,
    shiftDateKey(localDateKey(timeZone, now), 1),
  );
}
