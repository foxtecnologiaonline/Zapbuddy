import { NextRequest } from 'next/server';
import { findAccountIdByApiKey } from '@zapbuddy/db';

/** Extrai e valida a chave `Authorization: Bearer <chave>` — null se ausente/inválida/revogada. */
export async function getAccountIdFromApiKey(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const rawKey = header.slice('Bearer '.length).trim();
  if (!rawKey) return null;

  return findAccountIdByApiKey(rawKey);
}
