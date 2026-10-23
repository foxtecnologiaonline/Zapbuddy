import { fetchWithRetry } from '../../whatsapp/http-retry.js';
import type { CalendarEventInput, CalendarEventPatch, CreatedCalendarEvent, CalendarEventSummary, CalendarTokens } from '../types.js';

// Compartilhado com WhatsApp apesar do caminho (packages/core/src/whatsapp/http-retry.ts)
// — é só um fetch-com-retry genérico, não haveria ganho em duplicar.

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/** `state` é um nonce de CSRF (gerado e validado pelo caller — ver apps/web/app/api/calendar), nunca carrega dado de conta. */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent', // força o Google a sempre devolver refresh_token, mesmo em reconexão
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<CalendarTokens> {
  const response = await fetchWithRetry(
    GOOGLE_TOKEN_ENDPOINT,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    10_000,
  );
  if (!response.ok) {
    throw new Error(`Google token endpoint failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: json.expires_in };
}

export async function exchangeGoogleCode(code: string): Promise<CalendarTokens> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  );
}

/** Sem cache de access token (ver ADR 0002, decisão 3) — sempre renova antes de cada chamada à Calendar API. */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<CalendarTokens> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  );
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: CalendarEventInput,
): Promise<CreatedCalendarEvent> {
  const response = await fetchWithRetry(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startIso },
        end: { dateTime: input.endIso },
      }),
    },
    10_000,
  );

  if (!response.ok) {
    throw new Error(`Google Calendar event creation failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { id: string; htmlLink: string };
  return { id: json.id, htmlLink: json.htmlLink };
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<CalendarEventSummary[]> {
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const response = await fetchWithRetry(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    10_000,
  );

  if (!response.ok) {
    throw new Error(`Google Calendar list failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { items?: Array<{ id: string; summary?: string; start: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> };
  return (json.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(sem título)',
    startIso: item.start.dateTime ?? item.start.date ?? '',
    endIso: item.end?.dateTime ?? item.end?.date ?? '',
  }));
}

/** Apaga um evento criado pelo próprio assistente (usado pelo "desfazer"). 404/410 = já não existe, tratado como sucesso. */
export async function deleteGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const response = await fetchWithRetry(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    10_000,
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`Google Calendar event deletion failed (${response.status}): ${await response.text()}`);
  }
}

/** Edita um evento existente (PATCH — só os campos informados mudam). Lança em 404: o evento não existe mais nessa agenda. */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: CalendarEventPatch,
): Promise<CreatedCalendarEvent> {
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) body.summary = patch.summary;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.startIso !== undefined && patch.endIso !== undefined) {
    body.start = { dateTime: patch.startIso };
    body.end = { dateTime: patch.endIso };
  }

  const response = await fetchWithRetry(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    10_000,
  );

  if (!response.ok) {
    throw new Error(`Google Calendar event update failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { id: string; htmlLink: string };
  return { id: json.id, htmlLink: json.htmlLink };
}
