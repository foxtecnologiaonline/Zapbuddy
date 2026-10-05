import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLink, isMagicLinkValid } from '@zapbuddy/db';
import { createSessionCookieValue, sessionCookieName, sessionMaxAgeSeconds } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Renders a confirmation page instead of consuming the token immediately.
 * Chat clients (including WhatsApp's own link preview) prefetch URLs with a
 * plain GET to build a preview card — if GET consumed the token, the real
 * user would hit an already-used link. Consuming only happens on the
 * explicit POST below, triggered by a human tapping the button.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
  }

  const valid = await isMagicLinkValid(token);
  if (!valid) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', request.url));
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><title>ZapBuddy — Confirmar acesso</title></head>
<body style="font-family: system-ui, sans-serif; background: #0b0f14; color: #e6edf3; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <form method="POST" action="/api/auth/verify" style="text-align: center; max-width: 320px;">
    <h1 style="margin-bottom: 8px;">ZapBuddy</h1>
    <p style="opacity: 0.7;">Confirme para acessar seu painel.</p>
    <input type="hidden" name="token" value="${token.replace(/"/g, '&quot;')}" />
    <button type="submit" style="padding: 12px 24px; border-radius: 8px; border: none; background: #4ade80; color: #0b0f14; font-weight: 600; cursor: pointer;">
      Entrar no painel
    </button>
  </form>
</body>
</html>`;

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const token = form.get('token');
  if (typeof token !== 'string' || !token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url), { status: 303 });
  }

  const userId = await consumeMagicLink(token);
  if (!userId) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url), { status: 303 });
  response.cookies.set(sessionCookieName, createSessionCookieValue(userId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: sessionMaxAgeSeconds,
    path: '/',
  });
  return response;
}
