import { z } from 'zod';
import { createMemoryFact, deleteMemoryFact } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const rememberFactTool = defineTool({
  name: 'remember_fact',
  description:
    'Guarda um fato curto sobre ela ou a rotina dela pra conversas futuras ("minha sócia é a Ana"), só quando ela contar espontaneamente. Nunca pra dado financeiro (record_transaction), tarefa/lembrete nem o que ela pediu pra anotar (create_note).',
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
    'Esquece um fato (fact_id) que não é mais verdade. forgotten:false se não existe.',
  schema: z.object({
    fact_id: z.string().uuid(),
  }),
  execute: async (params, ctx) => {
    const memoryFact = await deleteMemoryFact(ctx.accountId, params.fact_id);
    return memoryFact ? { forgotten: true, fact_id: memoryFact.id } : { forgotten: false };
  },
});
