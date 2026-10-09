import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieName } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  response.cookies.delete(sessionCookieName);
  return response;
}
