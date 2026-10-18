import { NextRequest, NextResponse } from 'next/server';
import { listAllRemindersForExport } from '@zapbuddy/db';
import type { ReminderStatus } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ReminderStatus[] = ['pending', 'sent', 'failed', 'cancelled'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const statusParam = request.nextUrl.searchParams.get('status');
  const status = VALID_STATUSES.includes(statusParam as ReminderStatus) ? (statusParam as ReminderStatus) : undefined;
  const reminders = await listAllRemindersForExport(status);

  const csv = toCsv(reminders, [
    { key: 'id', label: 'id' },
    { value: (r) => r.users?.whatsapp_number ?? r.user_id, key: 'user_id', label: 'contato' },
    { key: 'message', label: 'mensagem' },
    { key: 'status', label: 'status' },
    { key: 'remind_at', label: 'disparo_em' },
    { key: 'failed_reason', label: 'motivo_falha' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lembretes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
