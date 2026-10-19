import { NextRequest, NextResponse } from 'next/server';
import { exportAccountData } from '@zapbuddy/db';
import { getCurrentUserId, getCurrentAccount } from '@/lib/auth';

/** Download de tudo que a conta registrou (JSON), pra portabilidade dos dados pela própria pessoa. */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await getCurrentAccount(userId);
  if (!account) return NextResponse.json({ error: 'no_account' }, { status: 400 });

  const data = await exportAccountData(account.accountId);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="zapbuddy-dados-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
