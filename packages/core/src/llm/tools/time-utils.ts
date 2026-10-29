import { z } from 'zod';
import { findUserById } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { daysUntilDate, nextNationalHoliday, timeInPlace } from '../../time/utils.js';
import { MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, scheduleFocusEnd } from '../../focus/schedule.js';
import { loadDayOverview } from '../../planning/day-overview.js';

export const timeUtilsTool = defineTool({
  name: 'time_utils',
  description:
    'Hora e datas exatas. action: now_in (place), days_until (date YYYY-MM-DD; negativo = já passou), next_holiday (nacional), focus (minutes: avisa quando acabar). found:false = fuso desconhecido: não chute.',
  schema: z.object({
    action: z.enum(['now_in', 'days_until', 'next_holiday', 'focus']),
    place: z.string().max(60).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    minutes: z.number().int().min(MIN_FOCUS_MINUTES).max(MAX_FOCUS_MINUTES).optional(),
  }),
  execute: async (params, ctx) => {
    if (params.action === 'now_in') {
      if (!params.place) return { found: false, reason: 'place_required' };
      return timeInPlace(params.place, ctx.timezone);
    }
    if (params.action === 'days_until') {
      if (!params.date) return { ok: false, reason: 'date_required' };
      const days = daysUntilDate(params.date, ctx.timezone);
      return days === null ? { ok: false, reason: 'invalid_date' } : { ok: true, date: params.date, days };
    }
    if (params.action === 'next_holiday') {
      return nextNationalHoliday(ctx.timezone) ?? { found: false };
    }
    const minutes = params.minutes ?? 25;
    const { reminderId, endsAtIso } = await scheduleFocusEnd(ctx.accountId, ctx.userId, minutes);
    return { scheduled: true, minutes, ends_at: endsAtIso, reminder_id: reminderId };
  },
});

export const getDayOverviewTool = defineTool({
  name: 'get_day_overview',
  description:
    'Panorama pra organizar o dia ("monta meu dia"): agenda, tarefas, lembretes, atrasadas, sem data, hábitos pendentes e horários livres. Sugira só com isso (urgentes nos horários livres) e crie algo só com o sim. failedSources preenchido = não afirme dia livre.',
  schema: z.object({
    period: z.enum(['today', 'tomorrow', 'week']).optional(),
  }),
  execute: async (params, ctx) => {
    const user = await findUserById(ctx.userId);
    const data = await loadDayOverview({
      accountId: ctx.accountId,
      timeZone: ctx.timezone,
      quietHoursStart: user?.quiet_hours_start ?? 22,
      quietHoursEnd: user?.quiet_hours_end ?? 7,
      period: params.period ?? 'today',
    });
    const { timeZone: _timeZone, nowIso: _nowIso, ...rest } = data;
    return rest;
  },
});
