import { z } from 'zod';
import {
  findUserById,
  saveMorningDigestPreferences,
  saveRoutinePrefs,
  saveUserCity,
  saveUserEmail,
  setOccupation,
  setQuietHours,
} from '@zapbuddy/db';
import { isWithinQuietHours } from '../../time/quiet-hours.js';
import { geocodeBrazilianCity } from '../../weather/geocoding.js';
import { defineTool } from '../tool-types.js';

/**
 * Cadastro progressivo (2026-10) — diferente do occupation capturado durante
 * complete_onboarding: essa aqui cobre quando a ocupação só vem à tona
 * depois do onboarding, numa conversa qualquer dos primeiros dias.
 */
export const updateOccupationTool = defineTool({
  name: 'update_occupation',
  description:
    'Guarda a ocupação quando ela mencionar de passagem (nunca pergunte à toa); só contexto de categorização.',
  schema: z.object({ occupation: z.string().min(1).max(200) }),
  execute: async (params, ctx) => {
    await setOccupation(ctx.userId, params.occupation);
    return { saved: true };
  },
});

export const setEmailTool = defineTool({
  name: 'set_email',
  description:
    'Guarda o e-mail, só se ela informar; nunca exija.',
  schema: z.object({ email: z.string().email() }),
  execute: async (params, ctx) => {
    await saveUserEmail(ctx.userId, params.email);
    return { saved: true };
  },
});

export const setQuietHoursTool = defineTool({
  name: 'set_quiet_hours',
  description:
    'Horário de silêncio (start_hour a end_hour locais, ex. 22 e 7): sem mensagem proativa (resumo, insight, semanal). Lembretes que ela agendou continuam.',
  schema: z.object({
    start_hour: z.number().int().min(0).max(23),
    end_hour: z.number().int().min(0).max(23),
  }),
  execute: async (params, ctx) => {
    await setQuietHours(ctx.userId, params.start_hour, params.end_hour);
    return { set: true, start_hour: params.start_hour, end_hour: params.end_hour };
  },
});

export const setCityTool = defineTool({
  name: 'set_city',
  description:
    'Guarda a cidade onde ela mora, só se ela disser (melhora o clima do resumo). Passe uf se ela disser o estado ou a cidade for ambígua. saved:false → peça cidade e estado.',
  schema: z.object({
    city: z.string().min(2).max(100),
    uf: z.string().length(2).optional(),
  }),
  execute: async (params, ctx) => {
    const found = await geocodeBrazilianCity(params.city, params.uf);
    if (!found) return { saved: false };
    await saveUserCity(ctx.userId, found);
    return { saved: true, city: found.city, uf: found.uf };
  },
});

export const setMorningDigestPreferencesTool = defineTool({
  name: 'set_morning_digest_preferences',
  description:
    'Ajusta o que o Tom manda sozinho. Resumo da manhã: enabled, hour (0-23), include_agenda, include_finance. ' +
    'Rotinas: checkins ("como foi?" depois de compromisso/tarefa; ligadas por padrão), weekly_tip (dica semanal; ' +
    'ligada), day_close (fechamento do dia à noite; DESLIGADO — só liga se ela pedir) e week_review (revisão no ' +
    'domingo; desligada). Só passe o que a pessoa pediu pra mudar.',
  schema: z.object({
    enabled: z.boolean().optional(),
    hour: z.number().int().min(0).max(23).optional(),
    include_agenda: z.boolean().optional(),
    include_finance: z.boolean().optional(),
    checkins: z.boolean().optional(),
    weekly_tip: z.boolean().optional(),
    day_close: z.boolean().optional(),
    week_review: z.boolean().optional(),
  }),
  execute: async (params, ctx) => {
    const routinePatch = {
      ...(params.checkins !== undefined ? { routine_checkins: params.checkins } : {}),
      ...(params.weekly_tip !== undefined ? { routine_weekly_tip: params.weekly_tip } : {}),
      ...(params.day_close !== undefined ? { routine_day_close: params.day_close } : {}),
      ...(params.week_review !== undefined ? { routine_week_review: params.week_review } : {}),
    };
    const digestUntouched =
      params.enabled === undefined && params.hour === undefined && params.include_agenda === undefined && params.include_finance === undefined;
    if (digestUntouched && Object.keys(routinePatch).length === 0) {
      return { saved: false, reason: 'nothing_to_change' };
    }
    if (digestUntouched) {
      const routines = await saveRoutinePrefs(ctx.userId, routinePatch);
      return { saved: true, routines };
    }

    if (params.hour !== undefined) {
      const user = await findUserById(ctx.userId);
      // Mensagem proativa dentro do horário de silêncio nunca sai — avisar em vez de gravar um horário que não funciona.
      if (user && isWithinQuietHours(params.hour, user.quiet_hours_start, user.quiet_hours_end)) {
        return {
          saved: false,
          reason: 'inside_quiet_hours',
          quiet_hours_start: user.quiet_hours_start,
          quiet_hours_end: user.quiet_hours_end,
        };
      }
    }

    const user = await saveMorningDigestPreferences(ctx.userId, {
      enabled: params.enabled,
      hour: params.hour,
      includeAgenda: params.include_agenda,
      includeFinance: params.include_finance,
    });
    const routines = Object.keys(routinePatch).length > 0 ? await saveRoutinePrefs(ctx.userId, routinePatch) : undefined;
    return {
      saved: true,
      ...(routines ? { routines } : {}),
      enabled: user.morning_digest_enabled,
      hour: user.morning_digest_hour,
      include_agenda: user.morning_digest_agenda,
      include_finance: user.morning_digest_finance,
    };
  },
});
