import { NextRequest, NextResponse } from 'next/server';
import { adminCancelReminder, logAdminAction } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const cancelled = await adminCancelReminder(id);
  if (cancelled) {
    void logAdminAction({
      action: 'reminder_cancelled',
      targetType: 'reminder',
      targetId: id,
      detail: { message: cancelled.message, userId: cancelled.user_id },
    });
  }

  const referer = request.headers.get('referer');
  const redirectTarget = referer && referer.startsWith(new URL('/', request.url).origin) ? referer : '/admin/reminders';

  return NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
}
