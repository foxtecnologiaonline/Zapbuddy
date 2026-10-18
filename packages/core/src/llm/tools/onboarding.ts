import { z } from 'zod';
import { completeOnboarding, setPreferredName } from '@zapbuddy/db';
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

export const setPreferredNameTool = defineTool({
  name: 'set_preferred_name',
  description:
    'Salva como a pessoa pediu pra ser chamada (ex.: "pode me chamar de Mari", "me chama de Zé"), ' +
    'diferente do nome completo do cadastro. Use sempre que ela pedir isso explicitamente, mesmo ' +
    'fora do onboarding. Passe preferred_name: null se ela disser pra voltar a usar o nome normal.',
  schema: z.object({
    preferred_name: z.string().min(1).nullable(),
  }),
  execute: async (params, ctx) => {
    const user = await setPreferredName(ctx.userId, params.preferred_name);
    return { set: true, preferred_name: user.preferred_name };
  },
});
