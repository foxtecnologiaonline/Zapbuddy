import { NextRequest, NextResponse } from 'next/server';
import { updateUserPlanStatus } from '@zapbuddy/db';
import type { PlanStatus } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: PlanStatus[] = ['trial', 'active', 'canceled'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const form = await request.formData();
  const status = form.get('status');

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as PlanStatus)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  await updateUserPlanStatus(id, status as PlanStatus);

  // Volta pra página de origem (lista ou detalhe do contato) quando o form a informa;
  // sem isso, salvar no detalhe do contato te chutava de volta pra lista.
  const referer = request.headers.get('referer');
  const redirectTarget = referer && referer.startsWith(new URL('/', request.url).origin) ? referer : '/admin/contacts';

  return NextResponse.redirect(new URL(redirectTarget, request.url), { status: 303 });
}
