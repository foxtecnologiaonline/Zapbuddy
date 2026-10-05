import { z } from 'zod';
import { completeOnboarding } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const completeOnboardingTool = defineTool({
  name: 'complete_onboarding',
  description:
    'Finaliza o cadastro do usuário salvando o nome informado por ele. ' +
    'Chame esta tool assim que o usuário informar o nome dele durante o onboarding.',
  schema: z.object({
    name: z.string().min(1),
  }),
  execute: async (params, ctx) => {
    const user = await completeOnboarding(ctx.userId, params.name);
    return { user_id: user.id, onboarding_completed: true };
  },
});
