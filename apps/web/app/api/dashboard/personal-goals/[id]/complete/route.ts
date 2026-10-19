import { NextRequest, NextResponse } from 'next/server';
import { completePersonalGoal } from '@zapbuddy/db';
import { getCurrentUserId, getCurrentAccount } from '@/lib/auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await getCurrentAccount(userId);
  if (!account) return NextResponse.json({ error: 'no_account' }, { status: 400 });

  const { id } = await params;
  await completePersonalGoal(account.accountId, id);

  return NextResponse.redirect(new URL('/dashboard', process.env.WEB_APP_URL));
}
