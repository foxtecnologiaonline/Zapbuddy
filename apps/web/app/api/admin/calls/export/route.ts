import { NextRequest, NextResponse } from 'next/server';
import { listRecentToolCallLogsForExport } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const successParam = params.get('success');
  const success = successParam === 'true' ? true : successParam === 'false' ? false : undefined;
  const toolName = params.get('tool') ?? undefined;
  const userId = params.get('userId') ?? undefined;

  const logs = await listRecentToolCallLogsForExport({ success, toolName, userId });

  const csv = toCsv(logs, [
    { key: 'id', label: 'id' },
    { key: 'created_at', label: 'quando' },
    { key: 'tool_name', label: 'tool' },
    { value: (l) => (l.success ? 'ok' : 'falhou'), key: 'success', label: 'status' },
    { value: (l) => JSON.stringify(l.parameters), key: 'parameters', label: 'parametros' },
    { key: 'error', label: 'erro' },
    { key: 'user_id', label: 'user_id' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="chamadas-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
