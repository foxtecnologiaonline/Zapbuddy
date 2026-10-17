import { NextRequest, NextResponse } from 'next/server';
import { createApiKey } from '@zapbuddy/db';
import { getCurrentUserId, getCurrentAccount } from '@/lib/auth';

const MAX_NAME_LENGTH = 100;

/** Cria uma chave de API pra conta logada — a chave em claro só existe nesta resposta (ver api-keys.ts). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await getCurrentAccount(userId);
  if (!account) return NextResponse.json({ error: 'no_account' }, { status: 400 });

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH) || 'Minha integração';

  const created = await createApiKey(account.accountId, name);

  const redirectUrl = new URL('/dashboard', process.env.WEB_APP_URL);
  redirectUrl.searchParams.set('new_api_key', created.rawKey);
  return NextResponse.redirect(redirectUrl);
}
