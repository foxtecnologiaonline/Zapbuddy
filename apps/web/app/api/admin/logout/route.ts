import { NextRequest, NextResponse } from 'next/server';
import { adminSessionCookieName } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/admin/login', request.url), { status: 303 });
  response.cookies.delete(adminSessionCookieName);
  return response;
}
