import { randomUUID } from 'node:crypto';
import { fetchWithRetry } from '../../whatsapp/http-retry.js';
import { failApiResponse, failTokenResponse } from '../errors.js';
import { nearestUtcDate } from '../events.js';
import type { CalendarEventInput, CalendarEventPatch, CreatedCalendarEvent, CalendarEventSummary, CalendarTokens } from '../types.js';
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
  if (!response.ok) await failTokenResponse('Microsoft', response);
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
        // Identificador do cliente pro Graph não criar duas vezes o mesmo evento se o `fetchWithRetry` repetir o POST
        // (a 1ª tentativa criou, mas a resposta estourou o timeout). Gerado uma vez por chamada, vale pras duas tentativas.
        transactionId: randomUUID(),
      }),
    },
    10_000,
  );

  if (!response.ok) await failApiResponse('Outlook: criação do evento', response);
  const json = (await response.json()) as { id: string; webLink: string };
  return { id: json.id, htmlLink: json.webLink };
}

interface GraphEventItem {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  responseStatus?: { response?: string };
  start: { dateTime: string };
  end?: { dateTime: string };
}

const GRAPH_PAGE_SIZE = 100;
/** Teto de páginas (1.000 eventos): uma janela de semana nunca chega perto; evita laço se o provedor repetir o link. */
const GRAPH_MAX_PAGES = 10;

export async function listMicrosoftCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<CalendarEventSummary[]> {
  // calendarView (não /events) expande recorrência dentro da janela pedida — equivalente ao singleEvents=true do Google.
  // `$top` e `$orderby`: sem eles o Graph devolve poucos itens por página (10, por padrão) e sem ordem garantida.
  const params = new URLSearchParams({
    startDateTime: timeMinIso,
    endDateTime: timeMaxIso,
    $top: String(GRAPH_PAGE_SIZE),
    $orderby: 'start/dateTime',
    $select: 'id,subject,start,end,isAllDay,isCancelled,showAs,responseStatus',
  });
  let url: string | undefined = `${calendarViewPath(calendarId)}?${params.toString()}`;
  const events: CalendarEventSummary[] = [];

  for (let page = 0; page < GRAPH_MAX_PAGES && url; page += 1) {
    const response: Response = await fetchWithRetry(
      url,
      // Pede UTC explícito: `fromGraphDateTime` assume UTC, então não dependemos do padrão do Graph.
      { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } },
      10_000,
    );
    if (!response.ok) await failApiResponse('Outlook: listagem', response);

    const json = (await response.json()) as { value?: GraphEventItem[]; '@odata.nextLink'?: string };
    for (const item of json.value ?? []) {
      if (item.isCancelled) continue; // o calendarView devolve ocorrências canceladas: não são compromisso
      const startIso = fromGraphDateTime(item.start.dateTime);
      const endIso = item.end ? fromGraphDateTime(item.end.dateTime) : '';
      const allDay = item.isAllDay === true;
      events.push({
        id: item.id,
        summary: item.subject ?? '(sem título)',
        // Dia inteiro vira só a data, a convenção do projeto (ver calendar/events.ts); o Graph manda meia-noite deslocada.
        startIso: allDay ? nearestUtcDate(startIso) : startIso,
        endIso: allDay && endIso ? nearestUtcDate(endIso) : endIso,
        busy: item.showAs !== 'free' && item.responseStatus?.response !== 'declined',
      });
    }

    // O link de próxima página vem do provedor; só o seguimos se for do próprio Graph, pra nunca mandar o token a outro host.
    const next: string | undefined = json['@odata.nextLink'];
    url = next && next.startsWith(`${GRAPH_BASE}/`) ? next : undefined;
  }
  return events;
}

/**
 * Apaga um evento. Devolve `false` quando ele já não existia (404): quem chama decide se isso é sucesso (o "desfazer"
 * aceita) ou erro (a tool `delete_calendar_event` não pode dizer "apaguei" de um id que nunca existiu).
 */
export async function deleteMicrosoftCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<boolean> {
  const response = await fetchWithRetry(
    `${eventsPath(calendarId)}/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    10_000,
  );

  if (response.status === 404) return false;
  if (!response.ok) await failApiResponse('Outlook: exclusão do evento', response);
  return true;
}

/** Edita um evento existente (PATCH — só os campos informados mudam). Lança em 404: o evento não existe mais nessa agenda. */
export async function updateMicrosoftCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: CalendarEventPatch,
): Promise<CreatedCalendarEvent> {
  const body: Record<string, unknown> = {};
  if (patch.summary !== undefined) body.subject = patch.summary;
  if (patch.description !== undefined) body.body = { contentType: 'text', content: patch.description };
  if (patch.startIso !== undefined && patch.endIso !== undefined) {
    body.start = toGraphDateTime(patch.startIso);
    body.end = toGraphDateTime(patch.endIso);
  }

  const response = await fetchWithRetry(
    `${eventsPath(calendarId)}/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    10_000,
  );

  if (!response.ok) await failApiResponse('Outlook: edição do evento', response);
  const json = (await response.json()) as { id: string; webLink: string };
  return { id: json.id, htmlLink: json.webLink };
}
