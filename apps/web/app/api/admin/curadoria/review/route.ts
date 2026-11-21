import { NextRequest, NextResponse } from 'next/server';
import {
  CurationCaseNotFoundError,
  CurationInvalidReviewError,
  CurationTableMissingError,
  logAdminAction,
  saveCurationReview,
} from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { parseOutcome, safeBackPath } from '@/lib/curation-form';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redirectBack(request: NextRequest, back: string, flash: { ok?: string; erro?: string }): NextResponse {
  const url = new URL(back, request.url);
  url.searchParams.delete('ok');
  url.searchParams.delete('erro');
  if (flash.ok) url.searchParams.set('ok', flash.ok);
  if (flash.erro) url.searchParams.set('erro', flash.erro);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const back = safeBackPath(form.get('back'));
  const logId = form.get('log_id');
  const outcome = form.get('outcome');
  const note = form.get('note');

  if (typeof logId !== 'string' || !UUID.test(logId) || typeof outcome !== 'string') {
    return redirectBack(request, back, { erro: 'Pedido inválido.' });
  }

  const { verdict, destination } = parseOutcome(outcome);
  try {
    const curationCase = await saveCurationReview({ logId, verdict, destination, note: typeof note === 'string' ? note : null });
    void logAdminAction({
      action: 'curation_reviewed',
      targetType: 'tool_call_log',
      targetId: logId,
      detail: { signal: curationCase.signal, verdict, destination },
    });
    return redirectBack(request, back, { ok: '1' });
  } catch (error) {
    if (error instanceof CurationInvalidReviewError || error instanceof CurationCaseNotFoundError || error instanceof CurationTableMissingError) {
      return redirectBack(request, back, { erro: error.message });
    }
    throw error;
  }
}
