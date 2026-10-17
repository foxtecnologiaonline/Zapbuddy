import { fetchWithRetry } from '../whatsapp/http-retry.js';

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

/** `state` carrega o accountId (assinado/validado pelo caller — ver apps/web/app/api/calendar) pra ligar o callback à conta certa. */
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

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
}

async function postToken(body: URLSearchParams): Promise<GoogleTokens> {
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

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
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
export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokens> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  );
}
