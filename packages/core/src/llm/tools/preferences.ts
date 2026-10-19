import { z } from 'zod';
import { setQuietHours, setOccupation, saveUserEmail } from '@zapbuddy/db';
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
