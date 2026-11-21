import { NextResponse } from 'next/server';
import { CurationTableMissingError, listCurationReviews } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

/** Vereditos da curadoria: o que o Tom errou e pra onde o caso foi (prompt, categoria, bug, caso de teste). Trechos já mascarados na gravação. */
export async function GET(): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let reviews;
  try {
    reviews = await listCurationReviews();
  } catch (error) {
    if (error instanceof CurationTableMissingError) return NextResponse.json({ error: error.message }, { status: 503 });
    throw error;
  }

  const snapshotField = (value: Record<string, unknown>, key: string): string => {
    const field = value[key];
    return typeof field === 'string' ? field : '';
  };

  const csv = toCsv(reviews, [
    { key: 'reviewedAt', label: 'revisado_em' },
    { key: 'signal', label: 'sinal' },
    { key: 'verdict', label: 'veredito' },
    { key: 'destination', label: 'destino' },
    { key: 'note', label: 'nota' },
    { value: (r) => snapshotField(r.snapshot, 'tool_name'), key: 'tool', label: 'tool' },
    { value: (r) => snapshotField(r.snapshot, 'summary'), key: 'summary', label: 'resumo' },
    { value: (r) => snapshotField(r.snapshot, 'parameters'), key: 'parameters', label: 'parametros' },
    { value: (r) => snapshotField(r.snapshot, 'result'), key: 'result', label: 'resultado' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="curadoria-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
