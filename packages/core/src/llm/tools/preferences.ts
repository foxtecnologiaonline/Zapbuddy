import { z } from 'zod';
import {
  findUserById,
  saveMorningDigestPreferences,
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
    'Guarda a ocupação/profissão da pessoa quando ela menciona de passagem (nunca pergunte isso separado, sem necessidade) — ' +
    'usado só pra dar mais contexto na categorização de gasto, nunca repetido de volta pra ela.',
  schema: z.object({ occupation: z.string().min(1).max(200) }),
  execute: async (params, ctx) => {
    await setOccupation(ctx.userId, params.occupation);
    return { saved: true };
  },
});

export const setEmailTool = defineTool({
  name: 'set_email',
  description:
    'Guarda o e-mail da pessoa, só quando ela mesma informar (nunca invente, nunca exija pra usar o Tom) — ' +
    'útil pra ela recuperar acesso ao painel depois.',
  schema: z.object({ email: z.string().email() }),
  execute: async (params, ctx) => {
    await saveUserEmail(ctx.userId, params.email);
    return { saved: true };
  },
});

export const setQuietHoursTool = defineTool({
  name: 'set_quiet_hours',
  description:
    'Define o horário de silêncio: nenhuma mensagem proativa (resumo do dia, insight, resumo semanal) é enviada ' +
    'entre start_hour e end_hour no horário local da pessoa. Ex.: 22 e 7 = de 22h às 7h. Não afeta lembretes que ' +
    'a pessoa agendou — esses são pedidos explícitos com hora marcada.',
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
    'Guarda a cidade onde a pessoa mora, só quando ela mesma disser. Melhora a previsão do tempo do resumo da manhã ' +
    '(sem isso, o Tom estima pela região do DDD do WhatsApp). Passe uf (sigla) se ela falar o estado ou se a cidade ' +
    'tiver nome comum em vários estados. Se voltar saved=false, diga que não conseguiu localizar e peça cidade e estado.',
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
    'Ajusta o resumo da manhã que o Tom manda sozinho: ligar/desligar (enabled), horário local de chegada (hour, 0-23), ' +
    'e se inclui a parte de agenda/tarefas (include_agenda) e a parte financeira (include_finance). Só passe o que ' +
    'a pessoa pediu pra mudar. Ex.: "me manda o resumo às 7h" → hour 7; "tira a parte financeira" → ' +
    'include_finance false; "não quero mais o resumo" → enabled false.',
  schema: z.object({
    enabled: z.boolean().optional(),
    hour: z.number().int().min(0).max(23).optional(),
    include_agenda: z.boolean().optional(),
    include_finance: z.boolean().optional(),
  }),
  execute: async (params, ctx) => {
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
    return {
      saved: true,
      enabled: user.morning_digest_enabled,
      hour: user.morning_digest_hour,
      include_agenda: user.morning_digest_agenda,
      include_finance: user.morning_digest_finance,
    };
  },
});
