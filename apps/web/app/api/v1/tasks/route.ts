import { NextRequest, NextResponse } from 'next/server';
import { listTasks, type TaskStatus } from '@zapbuddy/db';
import { getAccountIdFromApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: TaskStatus[] = ['pending', 'completed'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accountId = await getAccountIdFromApiKey(request);
  if (!accountId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const statusParam = new URL(request.url).searchParams.get('status');
  const status = VALID_STATUSES.includes(statusParam as TaskStatus) ? (statusParam as TaskStatus) : undefined;

  const tasks = await listTasks(accountId, status);
  return NextResponse.json({ tasks });
}
