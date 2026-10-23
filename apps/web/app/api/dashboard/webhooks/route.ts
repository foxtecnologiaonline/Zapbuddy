import { NextRequest, NextResponse } from 'next/server';
import { createWebhookSubscription, type WebhookEventTypePublic } from '@zapbuddy/db';
import { isSafeWebhookUrlSyntax } from '@zapbuddy/core';
import { getCurrentUserId, getCurrentAccount } from '@/lib/auth';

const VALID_EVENT_TYPES: WebhookEventTypePublic[] = ['transaction.created', 'task.completed'];

/** Registra uma assinatura de webhook pra conta logada — o segredo de assinatura só existe nesta resposta. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await getCurrentAccount(userId);
  if (!account) return NextResponse.json({ error: 'no_account' }, { status: 400 });

  const form = await request.formData();
  const url = String(form.get('url') ?? '').trim();
  const eventTypes = form.getAll('event_types').map(String).filter((e): e is WebhookEventTypePublic => VALID_EVENT_TYPES.includes(e as WebhookEventTypePublic));

  const redirectUrl = new URL('/dashboard', process.env.WEB_APP_URL);
  if (!isSafeWebhookUrlSyntax(url) || eventTypes.length === 0) {
    redirectUrl.searchParams.set('webhook', 'error');
    return NextResponse.redirect(redirectUrl);
  }

  const created = await createWebhookSubscription(account.accountId, url, eventTypes);
  redirectUrl.searchParams.set('new_webhook_secret', created.secret);
  return NextResponse.redirect(redirectUrl);
}
