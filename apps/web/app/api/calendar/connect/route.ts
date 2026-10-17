import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildGoogleAuthUrl } from '@zapbuddy/core';
import { getCurrentUserId } from '@/lib/auth';
import { GOOGLE_OAUTH_STATE_COOKIE } from '@/lib/google-oauth-state';

const STATE_TTL_SECONDS = 60 * 10;

/** Inicia o fluxo OAuth do Google — exige sessão do dashboard (login via magic link). */
export async function GET(): Promise<NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.redirect(new URL('/login', process.env.WEB_APP_URL));

  // Nonce de CSRF — nunca carrega accountId (o callback resolve a conta pela
  // sessão autenticada, nunca por um valor que veio do cliente/URL).
  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/',
  });
  return response;
}
