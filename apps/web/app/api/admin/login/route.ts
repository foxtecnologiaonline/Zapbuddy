import { NextRequest, NextResponse } from 'next/server';
import { adminSessionCookieName, adminSessionMaxAgeSeconds, createAdminSessionCookieValue, isAdminPasswordCorrect } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
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
