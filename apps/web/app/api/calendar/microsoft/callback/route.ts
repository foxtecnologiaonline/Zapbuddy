import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeMicrosoftCode, encryptSecret } from '@zapbuddy/core';
import { getAccountForUser, saveCalendarConnection, logError } from '@zapbuddy/db';
import { getCurrentUserId } from '@/lib/auth';
import { MICROSOFT_OAUTH_STATE_COOKIE } from '@/lib/microsoft-oauth-state';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Mesmo padrão de calendar/callback/route.ts (Google) — ver lá pros comentários completos do fluxo. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const webAppUrl = process.env.WEB_APP_URL;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.redirect(new URL('/login', webAppUrl));

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(MICROSOFT_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return NextResponse.redirect(new URL('/dashboard?calendar=error', webAppUrl));
  }

  const account = await getAccountForUser(userId);
  if (!account) {
    // Não deveria acontecer (todo usuário autenticado no dashboard já passou
    // pelo onboarding via WhatsApp, que garante uma conta) — defensivo.
    return NextResponse.redirect(new URL('/dashboard?calendar=error', webAppUrl));
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    if (!tokens.refreshToken) {
      // Sem offline_access respeitado (ou escopo não consentido) — sem
      // refresh token não tem como renovar o acesso depois.
      throw new Error('Microsoft não retornou refresh_token');
    }

    await saveCalendarConnection({
      accountId: account.accountId,
      provider: 'microsoft',
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      connectedByUserId: userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logError({ source: 'web', message: `microsoft_calendar_connect_failed: ${message}`, userId });
    return NextResponse.redirect(new URL('/dashboard?calendar=error', webAppUrl));
  }

  const response = NextResponse.redirect(new URL('/dashboard?calendar=connected', webAppUrl));
  response.cookies.delete(MICROSOFT_OAUTH_STATE_COOKIE);
  return response;
}
