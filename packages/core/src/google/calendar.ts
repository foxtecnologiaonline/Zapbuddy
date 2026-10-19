import { fetchWithRetry } from '../whatsapp/http-retry.js';

export interface CalendarEventInput {
  summary: string;
  /** ISO 8601 com timezone (ex.: `2026-10-20T15:00:00-03:00`) — nunca gerado pelo modelo sem passar pelo fuso do usuário. */
  startIso: string;
  endIso: string;
  description?: string;
}

export interface CreatedCalendarEvent {
  id: string;
  htmlLink: string;
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

export interface CalendarEventSummary {
  id: string;
  summary: string;
  startIso: string;
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
  const json = (await response.json()) as { items?: Array<{ id: string; summary?: string; start: { dateTime?: string; date?: string } }> };
  return (json.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(sem título)',
    startIso: item.start.dateTime ?? item.start.date ?? '',
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
