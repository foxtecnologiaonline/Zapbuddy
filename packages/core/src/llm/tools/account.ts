import { z } from 'zod';
import { createAccountInvite, listAccountMembers, getReferralStats, registerPlanIntent } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const inviteMemberTool = defineTool({
  name: 'invite_member',
  description:
    'Gera um código pra convidar outra pessoa a entrar na mesma conta (financeiro/tarefas/lembretes ' +
    'compartilhados — ex.: sócio, cônjuge). Só o dono da conta pode convidar. O código vale 15 minutos; ' +
    'diga à pessoa pra mandar "entrar <código>" no WhatsApp dela como uma das primeiras mensagens.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    if (ctx.role !== 'owner') {
      return { invited: false, reason: 'not_owner' };
    }
    const invite = await createAccountInvite(ctx.accountId, ctx.userId);
    return { invited: true, code: invite.code, expires_in_minutes: invite.expiresInMinutes };
  },
});

export const listMembersTool = defineTool({
  name: 'list_members',
  description: 'Lista quem faz parte da conta (dono + membros convidados).',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const members = await listAccountMembers(ctx.accountId);
    return { members: members.map((m) => ({ name: m.name, role: m.role })) };
  },
});

export const getReferralInfoTool = defineTool({
  name: 'get_referral_info',
  description:
    'Retorna o código de indicação da conta e quantas pessoas já se cadastraram usando ele. ' +
    'Use quando perguntarem "como funciona a indicação", "meu código", "quantas pessoas eu indiquei" etc. ' +
    'Pra indicar alguém, essa pessoa deve mandar "indicado <código>" como uma das primeiras mensagens dela.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const stats = await getReferralStats(ctx.accountId);
    return { referral_code: stats.code, total_referred: stats.totalReferred };
  },
});

export const registerPlanIntentTool = defineTool({
  name: 'register_plan_intent',
  description:
    'Registra que a pessoa disse, nesta conversa, que quer assinar (continuar pagando depois do ' +
    'teste) ou cancelar. Chame ANTES de confirmar "anotei"/"vou providenciar" — nunca diga isso sem ' +
    'ter chamado a tool, igual vale pra dado financeiro. Não cobra nada nem cancela nada sozinho: só ' +
    'avisa um humano, que trata manualmente (ainda não existe cobrança automática).',
  schema: z.object({
    intent: z.enum(['upgrade', 'cancel']),
  }),
  execute: async (params, ctx) => {
    await registerPlanIntent(ctx.userId, params.intent);
    return { registered: true };
  },
});
