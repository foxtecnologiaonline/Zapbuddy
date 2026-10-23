export type CalendarProviderName = 'google' | 'microsoft';

export interface CalendarEventInput {
  summary: string;
  /** ISO 8601 com timezone (ex.: `2026-10-20T15:00:00-03:00`) — nunca gerado pelo modelo sem passar pelo fuso do usuário. */
  startIso: string;
  endIso: string;
  description?: string;
}

export interface CreatedCalendarEvent {
  id: string;
  /** Link pra abrir o evento no app do provider — Google sempre devolve, Microsoft Graph também (webLink). */
  htmlLink: string;
}

export interface CalendarEventSummary {
  id: string;
  summary: string;
  startIso: string;
}

export interface CalendarTokens {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
}
