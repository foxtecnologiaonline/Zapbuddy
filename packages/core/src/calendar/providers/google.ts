import { randomBytes } from 'node:crypto';
import { fetchWithRetry } from '../../whatsapp/http-retry.js';
import { failApiResponse, failTokenResponse } from '../errors.js';
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
  if (!response.ok) await failTokenResponse('Google', response);
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

const BASE32HEX = '0123456789abcdefghijklmnopqrstuv';

/**
 * Id de evento gerado por nós (a API do Google aceita `id` próprio: base32hex, 5–1024 caracteres). Faz o POST ser
 * IDEMPOTENTE: se a 1ª tentativa criou o evento mas a resposta estourou o timeout, o retry do `fetchWithRetry` leva o
 * MESMO id e recebe 409 em vez de criar um segundo evento (auditoria 2026-11).
 */
export function newGoogleEventId(): string {
  const bytes = randomBytes(16);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32HEX[(value << (5 - bits)) & 31];
  return out;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: CalendarEventInput,
): Promise<CreatedCalendarEvent> {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const id = newGoogleEventId();
  const response = await fetchWithRetry(
    base,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startIso },
        end: { dateTime: input.endIso },
      }),
    },
    10_000,
  );

  // 409 = esse id já existe: uma tentativa anterior (que o retry não viu terminar) criou o evento. É sucesso, só buscar o link.
  if (response.status === 409) {
    const existing = await fetchWithRetry(`${base}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } }, 10_000);
    if (!existing.ok) await failApiResponse('Google Agenda: criação do evento', existing);
    const json = (await existing.json()) as { id: string; htmlLink: string };
    return { id: json.id, htmlLink: json.htmlLink };
  }
  if (!response.ok) await failApiResponse('Google Agenda: criação do evento', response);
  const json = (await response.json()) as { id: string; htmlLink: string };
  return { id: json.id, htmlLink: json.htmlLink };
}

interface GoogleEventItem {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

const GOOGLE_PAGE_SIZE = 250;
/** Teto de páginas (2.500 eventos): uma janela de semana nunca chega perto; evita laço infinito se o provedor repetir o token. */
const GOOGLE_MAX_PAGES = 10;

export async function listGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<CalendarEventSummary[]> {
  const events: CalendarEventSummary[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < GOOGLE_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(GOOGLE_PAGE_SIZE),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetchWithRetry(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      10_000,
    );
    if (!response.ok) await failApiResponse('Google Agenda: listagem', response);

    const json = (await response.json()) as { items?: GoogleEventItem[]; nextPageToken?: string };
    for (const item of json.items ?? []) {
      if (item.status === 'cancelled') continue; // cancelado não é compromisso
      const declined = item.attendees?.some((attendee) => attendee.self === true && attendee.responseStatus === 'declined') ?? false;
      events.push({
        id: item.id,
        summary: item.summary ?? '(sem título)',
        // Dia inteiro chega como `date` (sem hora): é a convenção do projeto (ver calendar/events.ts).
        startIso: item.start.dateTime ?? item.start.date ?? '',
        endIso: item.end?.dateTime ?? item.end?.date ?? '',
        busy: item.transparency !== 'transparent' && !declined,
      });
    }

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}

/**
 * Apaga um evento. Devolve `false` quando ele já não existia (404/410): quem chama decide se isso é sucesso (o
 * "desfazer" aceita) ou erro (a tool `delete_calendar_event` não pode dizer "apaguei" de um id que nunca existiu).
 */
export async function deleteGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<boolean> {
  const response = await fetchWithRetry(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    10_000,
  );

  if (response.status === 404 || response.status === 410) return false;
  if (!response.ok) await failApiResponse('Google Agenda: exclusão do evento', response);
  return true;
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

  if (!response.ok) await failApiResponse('Google Agenda: edição do evento', response);
  const json = (await response.json()) as { id: string; htmlLink: string };
  return { id: json.id, htmlLink: json.htmlLink };
}
