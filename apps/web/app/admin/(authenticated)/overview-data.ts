import { unstable_cache } from 'next/cache';
import {
  countErrorsSince,
  countFailedReminders,
  countPendingUpgradeIntents,
  countToolCallLogsSince,
  countUsers,
  countUsersByPlanStatus,
  countUsersSince,
  countWebhookEventsSince,
  getOnboardingFunnel,
  listToolCallCreatedAtSince,
  listUserCreatedAtSince,
} from '@zapbuddy/db';
import { bucketCountsByDay, TREND_WINDOW_DAYS } from './trend';

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchOverviewStats() {
  const now = Date.now();
  const sinceTodayIso = new Date(now - DAY_MS).toISOString();
  const since7dIso = new Date(now - 7 * DAY_MS).toISOString();
  const sinceTrendIso = new Date(now - TREND_WINDOW_DAYS * DAY_MS).toISOString();

  const [
    totalUsers,
    newUsersToday,
    newUsers7d,
    planStatusCounts,
    webhookAcceptedToday,
    webhookAccepted7d,
    webhookRejected7d,
    toolCallsToday,
    toolCalls7d,
    toolCallsFailedToday,
    toolCallsFailed7d,
    errorsToday,
    errors7d,
    failedReminders,
    onboardingFunnel,
    pendingUpgradeIntents,
    trendNewContacts,
    trendToolCalls,
  ] = await Promise.all([
    countUsers(),
    countUsersSince(sinceTodayIso),
    countUsersSince(since7dIso),
    countUsersByPlanStatus(),
    countWebhookEventsSince(sinceTodayIso, 'accepted'),
    countWebhookEventsSince(since7dIso, 'accepted'),
    countWebhookEventsSince(since7dIso, 'rejected'),
    countToolCallLogsSince(sinceTodayIso),
    countToolCallLogsSince(since7dIso),
    countToolCallLogsSince(sinceTodayIso, false),
    countToolCallLogsSince(since7dIso, false),
    countErrorsSince(sinceTodayIso),
    countErrorsSince(since7dIso),
    countFailedReminders(),
    getOnboardingFunnel(),
    countPendingUpgradeIntents(),
    listUserCreatedAtSince(sinceTrendIso),
    listToolCallCreatedAtSince(sinceTrendIso),
  ]);

  return {
    totalUsers,
    newUsersToday,
    newUsers7d,
    planStatusCounts,
    webhookAcceptedToday,
    webhookAccepted7d,
    webhookRejected7d,
    toolCallsToday,
    toolCalls7d,
    toolCallsFailedToday,
    toolCallsFailed7d,
    errorsTotalToday: errorsToday + toolCallsFailedToday,
    errorsTotal7d: errors7d + toolCallsFailed7d,
    failedReminders,
    onboardingFunnel,
    pendingUpgradeIntents,
    newContactsTrend: bucketCountsByDay(trendNewContacts),
    toolCallsTrend: bucketCountsByDay(trendToolCalls.map((t) => t.created_at)),
    toolCallsFailedTrend: bucketCountsByDay(trendToolCalls.filter((t) => !t.success).map((t) => t.created_at)),
  };
}

/**
 * 30s de cache — a visão geral é a página mais aberta do admin (ponto de
 * entrada), e refazer ~15 queries agregadas a cada reload sem necessidade
 * não compra nada: ninguém precisa de exatidão ao segundo num painel
 * operacional. unstable_cache (não um cache em memória local) porque
 * precisa valer entre invocações de função serverless na Vercel, que não
 * compartilham processo.
 */
export const getCachedOverviewStats = unstable_cache(fetchOverviewStats, ['admin-overview-stats'], { revalidate: 30 });
