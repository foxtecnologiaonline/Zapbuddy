import { NextRequest, NextResponse } from 'next/server';
import { isAdminLoginRateLimited } from '@zapbuddy/core';
import { adminSessionCookieName, adminSessionMaxAgeSeconds, createAdminSessionCookieValue, isAdminPasswordCorrect } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  // Vercel injeta x-forwarded-for; sem ele (dev local), cai num bucket
  // único — pior caso é todo mundo compartilhando o limite localmente,
  // nunca "sem limite".
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (await isAdminLoginRateLimited(clientIp(request))) {
    return NextResponse.redirect(new URL('/admin/login?error=rate_limited', request.url), { status: 303 });
  }

  const form = await request.formData();
  const password = form.get('password');

  if (typeof password !== 'string' || !isAdminPasswordCorrect(password)) {
    return NextResponse.redirect(new URL('/admin/login?error=invalid_password', request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL('/admin', request.url), { status: 303 });
  response.cookies.set(adminSessionCookieName, createAdminSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: adminSessionMaxAgeSeconds,
    path: '/',
  });
  return response;
}
