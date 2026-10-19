import { z } from 'zod';
import { createMemoryFact, deleteMemoryFact } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const rememberFactTool = defineTool({
  name: 'remember_fact',
  description:
    'Guarda um fato curto sobre a pessoa ou a rotina dela pra lembrar em conversas futuras (ex.: ' +
    '"trabalho de terça a sábado", "minha sócia se chama Ana", "prefiro ser chamado de Jão"). Use só ' +
    'quando a pessoa contar algo espontaneamente que vale a pena lembrar depois — nunca pra dado ' +
    'financeiro (isso é sempre record_transaction) nem pra tarefa/lembrete (isso é create_task/' +
    'create_reminder). Isto é o Tom lembrando de você, não você anotando algo pra si mesmo (isso é ' +
    'create_note).',
  schema: z.object({
    fact: z.string().min(1).max(500),
  }),
  execute: async (params, ctx) => {
    const memoryFact = await createMemoryFact(ctx.accountId, ctx.userId, params.fact);
    return { fact_id: memoryFact.id, remembered: true };
  },
});

export const forgetFactTool = defineTool({
  name: 'forget_fact',
  description:
    'Esquece um fato guardado anteriormente via remember_fact, dado o fact_id — use quando a pessoa ' +
    'disser que aquilo não é mais verdade ou pedir pra esquecer. Se o fact_id não existir mais nessa ' +
    'conta, retorna forgotten: false.',
  schema: z.object({
    fact_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const memoryFact = await deleteMemoryFact(ctx.accountId, params.fact_id);
    return memoryFact ? { forgotten: true, fact_id: memoryFact.id } : { forgotten: false };
  },
});
