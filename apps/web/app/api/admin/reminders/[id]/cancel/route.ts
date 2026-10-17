import { NextRequest, NextResponse } from 'next/server';
import { cancelReminder } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await cancelReminder(id);

  const referer = request.headers.get('referer');
  const redirectTarget = referer && referer.startsWith(new URL('/', request.url).origin) ? referer : '/admin/reminders';

  return NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
}
