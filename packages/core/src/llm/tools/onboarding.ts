import { z } from 'zod';
import { completeOnboarding, setPreferredName } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const completeOnboardingTool = defineTool({
  name: 'complete_onboarding',
  description:
    'Finaliza o cadastro com o nome que ela informou (e a ocupação, se mencionada — opcional, nunca insista). Chame assim que ela disser o nome no onboarding.',
  schema: z.object({
    name: z.string().min(1),
    occupation: z.string().min(1).optional(),
  }),
  execute: async (params, ctx) => {
    const user = await completeOnboarding(ctx.userId, params.name, params.occupation);
    return { user_id: user.id, onboarding_completed: true };
  },
});

export const setPreferredNameTool = defineTool({
  name: 'set_preferred_name',
  description:
    'Salva como ela quer ser chamada ("me chama de Zé"), mesmo fora do onboarding. preferred_name:null volta ao nome normal.',
  schema: z.object({
    preferred_name: z.string().min(1).nullable(),
  }),
  execute: async (params, ctx) => {
    const user = await setPreferredName(ctx.userId, params.preferred_name);
    return { set: true, preferred_name: user.preferred_name };
  },
});
