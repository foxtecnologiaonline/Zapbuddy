import { fetchWithRetry } from '../../whatsapp/http-retry.js';
import type { CalendarEventInput, CreatedCalendarEvent, CalendarEventSummary, CalendarTokens } from '../types.js';
import { toGraphDateTime, fromGraphDateTime } from './microsoft-datetime.js';

// Tenant `common` (não um tenant fixo): aceita conta pessoal Microsoft E
// conta de trabalho/escola — coerente com o posicionamento B2C do produto,
// não assume que a pessoa usa Outlook corporativo.
const MICROSOFT_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_SCOPE = 'offline_access Calendars.ReadWrite';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/** `state` é um nonce de CSRF (gerado e validado pelo caller — ver apps/web/app/api/calendar/microsoft), nunca carrega dado de conta. */
export function buildMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('MICROSOFT_CLIENT_ID'),
    redirect_uri: requireEnv('MICROSOFT_REDIRECT_URI'),
    response_type: 'code',
    scope: GRAPH_SCOPE,
    response_mode: 'query',
    state,
  });
  return `${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<CalendarTokens> {
  const response = await fetchWithRetry(
    MICROSOFT_TOKEN_ENDPOINT,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    10_000,
  );
  if (!response.ok) {
    throw new Error(`Microsoft token endpoint failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: json.expires_in };
}

export async function exchangeMicrosoftCode(code: string): Promise<CalendarTokens> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv('MICROSOFT_CLIENT_ID'),
      client_secret: requireEnv('MICROSOFT_CLIENT_SECRET'),
      redirect_uri: requireEnv('MICROSOFT_REDIRECT_URI'),
      grant_type: 'authorization_code',
      scope: GRAPH_SCOPE,
    }),
  );
}

/** Sem cache de access token (mesma decisão do Google, ADR 0002) — sempre renova antes de cada chamada ao Graph. */
export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<CalendarTokens> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv('MICROSOFT_CLIENT_ID'),
      client_secret: requireEnv('MICROSOFT_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      scope: GRAPH_SCOPE,
    }),
  );
}

/** `/me/calendar` é o calendário padrão da conta — mesmo sentinel `'primary'` já usado pro Google. */
function eventsPath(calendarId: string): string {
  return calendarId === 'primary' ? `${GRAPH_BASE}/me/calendar/events` : `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/events`;
}

function calendarViewPath(calendarId: string): string {
  return calendarId === 'primary' ? `${GRAPH_BASE}/me/calendarView` : `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView`;
}

export async function createMicrosoftCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: CalendarEventInput,
): Promise<CreatedCalendarEvent> {
  const response = await fetchWithRetry(
    eventsPath(calendarId),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.summary,
        body: { contentType: 'text', content: input.description ?? '' },
        start: toGraphDateTime(input.startIso),
        end: toGraphDateTime(input.endIso),
      }),
    },
    10_000,
  );

  if (!response.ok) {
    throw new Error(`Microsoft Calendar event creation failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { id: string; webLink: string };
  return { id: json.id, htmlLink: json.webLink };
}

export async function listMicrosoftCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<CalendarEventSummary[]> {
  // calendarView (não /events) expande recorrência dentro da janela pedida
  // — equivalente ao singleEvents=true do Google.
  const params = new URLSearchParams({ startDateTime: timeMinIso, endDateTime: timeMaxIso });
  const response = await fetchWithRetry(
    `${calendarViewPath(calendarId)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    10_000,
  );

  if (!response.ok) {
    throw new Error(`Microsoft Calendar list failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { value?: Array<{ id: string; subject?: string; start: { dateTime: string } }> };
  return (json.value ?? []).map((item) => ({
    id: item.id,
    summary: item.subject ?? '(sem título)',
    startIso: fromGraphDateTime(item.start.dateTime),
  }));
}

/** Apaga um evento criado pelo próprio assistente (usado pelo "desfazer"). 404 = já não existe, tratado como sucesso. */
export async function deleteMicrosoftCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const response = await fetchWithRetry(
    `${eventsPath(calendarId)}/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    10_000,
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Microsoft Calendar event deletion failed (${response.status}): ${await response.text()}`);
  }
}
