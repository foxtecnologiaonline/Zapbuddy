import { NextRequest, NextResponse } from 'next/server';
import { listTransactions } from '@zapbuddy/db';
import { getAccountIdFromApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW_DAYS = 30;

/**
 * API pública só-leitura (ADR 0003, decisão 5) — `from`/`to` são ISO 8601
 * explícitos (não "hoje"/"essa semana" como nas tools do WhatsApp): quem
 * integra via API já manda limites concretos, sem a ambiguidade de
 * linguagem natural que exige resolver fuso horário do lado do servidor.
 * Default sem os dois: últimos 30 dias corridos em UTC.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const accountId = await getAccountIdFromApiKey(request);
  if (!accountId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const toIso = searchParams.get('to') ?? new Date().toISOString();
  const fromIso = searchParams.get('from') ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 86_400_000).toISOString();

  const transactions = await listTransactions(accountId, fromIso, toIso, {
    columns: 'id, type, amount_cents, category, description, occurred_at, created_at',
  });

  return NextResponse.json({ transactions });
}
