import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLink } from '@zapbuddy/db';
import { createSessionCookieValue, sessionCookieName, sessionMaxAgeSeconds } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
  }

  const userId = await consumeMagicLink(token);
  if (!userId) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired', request.url));
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.set(sessionCookieName, createSessionCookieValue(userId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: sessionMaxAgeSeconds,
    path: '/',
  });
  return response;
}
