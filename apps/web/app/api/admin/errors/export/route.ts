import { NextResponse } from 'next/server';
import { listRecentErrors, listRecentFailedReminders, listRecentFailedToolCallLogs } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const EXPORT_LIMIT = 500;

interface UnifiedError {
  id: string;
  createdAt: string;
  source: string;
  message: string;
}

export async function GET(): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [errorLogs, failedToolCalls, failedReminders] = await Promise.all([
    listRecentErrors(EXPORT_LIMIT),
    listRecentFailedToolCallLogs(EXPORT_LIMIT),
    listRecentFailedReminders(EXPORT_LIMIT),
  ]);

  // Mesma lógica de unificação de apps/web/app/admin/(authenticated)/errors/page.tsx — repetida
  // (não extraída pra função compartilhada) porque uma vive em server component, outra em route handler.
  const unified: UnifiedError[] = [
    ...errorLogs.map((e) => ({ id: e.id, createdAt: e.created_at, source: e.source, message: e.message })),
    ...failedToolCalls.map((t) => ({ id: t.id, createdAt: t.created_at, source: `tool_call:${t.tool_name}`, message: t.error ?? 'falha sem mensagem' })),
    ...failedReminders.map((r) => ({ id: r.id, createdAt: r.created_at, source: 'reminder', message: r.failed_reason ?? 'falha sem mensagem' })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const csv = toCsv(unified, [
    { key: 'id', label: 'id' },
    { key: 'createdAt', label: 'quando' },
    { key: 'source', label: 'fonte' },
    { key: 'message', label: 'mensagem' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="erros-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
