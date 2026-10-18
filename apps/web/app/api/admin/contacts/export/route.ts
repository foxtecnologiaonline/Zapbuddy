import { NextRequest, NextResponse } from 'next/server';
import { listAllUsersForExport } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') ?? undefined;
  const users = await listAllUsersForExport(q);

  const csv = toCsv(users, [
    { key: 'id', label: 'id' },
    { key: 'whatsapp_number', label: 'whatsapp_number' },
    { key: 'name', label: 'nome' },
    { key: 'plan_status', label: 'assinatura' },
    { value: (u) => (u.onboarding_completed_at ? 'completo' : 'pendente'), label: 'onboarding', key: 'onboarding_completed_at' },
    { key: 'created_at', label: 'criado_em' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contatos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
