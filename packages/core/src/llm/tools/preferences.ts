import { z } from 'zod';
import { setQuietHours } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

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
