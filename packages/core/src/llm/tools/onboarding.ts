import { z } from 'zod';
import { completeOnboarding } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const completeOnboardingTool = defineTool({
  name: 'complete_onboarding',
  description:
    'Finaliza o cadastro do usuário salvando o nome informado por ele, e a ocupação/tipo de ' +
    'negócio se ela tiver sido mencionada (ajuda a categorização automática — nunca pergunte de ' +
    'novo nem insista nisso, é opcional). Chame esta tool assim que o usuário informar o nome ' +
    'dele durante o onboarding.',
  schema: z.object({
    name: z.string().min(1),
    occupation: z.string().min(1).optional(),
  }),
  execute: async (params, ctx) => {
    const user = await completeOnboarding(ctx.userId, params.name, params.occupation);
    return { user_id: user.id, onboarding_completed: true };
  },
});
