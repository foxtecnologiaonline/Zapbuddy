import { z } from 'zod';
import { completeOnboarding, setPreferredName } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { sanitizeOccupation, sanitizePersonName } from './person-name.js';

export const completeOnboardingTool = defineTool({
  name: 'complete_onboarding',
  description:
    'Finaliza o cadastro com o nome que ela informou (e a ocupação, se mencionada — opcional, nunca insista). Chame assim que ela disser o nome no onboarding.',
  schema: z.object({
    name: z.string().min(1).max(200),
    occupation: z.string().min(1).max(300).optional(),
  }),
  execute: async (params, ctx) => {
    // O nome entra no system prompt de toda mensagem: só passa o que é nome (sem quebra de linha, "#", ":", tamanho gigante).
    const name = sanitizePersonName(params.name);
    if (name === null) {
      return { onboarding_completed: false, reason: 'invalid_name', hint: 'Peça de novo, de forma leve, como ela quer ser chamada.' };
    }
    const user = await completeOnboarding(ctx.userId, name, sanitizeOccupation(params.occupation));
    return { user_id: user.id, onboarding_completed: true };
  },
});

export const setPreferredNameTool = defineTool({
  name: 'set_preferred_name',
  description:
    'Salva como ela quer ser chamada ("me chama de Zé"), mesmo fora do onboarding. preferred_name:null volta ao nome normal.',
  schema: z.object({
    preferred_name: z.string().min(1).max(200).nullable(),
  }),
  execute: async (params, ctx) => {
    const preferred = params.preferred_name === null ? null : sanitizePersonName(params.preferred_name);
    if (params.preferred_name !== null && preferred === null) return { set: false, reason: 'invalid_name' };
    const user = await setPreferredName(ctx.userId, preferred);
    return { set: true, preferred_name: user.preferred_name };
  },
});
