import { z } from 'zod';
import { createAccountInvite, listAccountMembers } from '@zapbuddy/db';
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
