import { z } from 'zod';
import { createAccountInvite, listAccountMembers, getReferralStats, registerPlanIntent, findUserById } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { generateUpgradeCheckout } from '../../payments/upgrade-flow.js';
import { buildReferralWhatsappDeepLink, WhatsappNumberNotConfiguredError } from '../../whatsapp/deep-link.js';

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
    'Retorna o código de indicação da conta, quantas pessoas já se cadastraram usando ele, e um link ' +
    'wa.me pronto (texto "Indicado <código>" já preenchido) pra mandar direto pra pessoa indicada clicar ' +
    'e abrir a conversa com você. Use quando perguntarem "como funciona a indicação", "meu código", ' +
    '"quantas pessoas eu indiquei" etc. Se referral_link vier ausente, mande só o código mesmo — a pessoa ' +
    'indicada ainda pode mandar "indicado <código>" manualmente.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const stats = await getReferralStats(ctx.accountId);
    let referralLink: string | undefined;
    try {
      referralLink = buildReferralWhatsappDeepLink(stats.code);
    } catch (error) {
      if (!(error instanceof WhatsappNumberNotConfiguredError)) throw error;
    }
    return { referral_code: stats.code, total_referred: stats.totalReferred, referral_link: referralLink };
  },
});

export const registerPlanIntentTool = defineTool({
  name: 'register_plan_intent',
  description:
    'Registra que a pessoa disse, nesta conversa, que quer assinar (continuar pagando depois do ' +
    'teste) ou cancelar. Chame ANTES de confirmar "anotei"/"vou providenciar" — nunca diga isso sem ' +
    'ter chamado a tool, igual vale pra dado financeiro.\n' +
    '- intent "cancel": não cancela nada sozinho — só avisa um humano, que confirma manualmente.\n' +
    '- intent "upgrade": gera um checkout REAL (Asaas, R$ 27,90/mês, PIX/boleto/cartão à escolha da ' +
    'pessoa na própria página). Exige CPF ou CNPJ (exigência da Asaas, não sua) — se ainda não tiver, ' +
    'o retorno vem com needs_cpf: true; peça o CPF/CNPJ e chame de novo com cpf_cnpj preenchido. Se ' +
    'vier invalid_cpf: true, o número não tem a quantidade certa de dígitos (11 pra CPF, 14 pra CNPJ) ' +
    '— avise e peça de novo, sem chamar a tool até ter algo plausível. Quando vier checkout_url, mande ' +
    'esse link pra ela — nunca invente outro valor, prazo "que acaba hoje" ou prova social que você ' +
    'não tenha de verdade.',
  schema: z.object({
    intent: z.enum(['upgrade', 'cancel']),
    cpf_cnpj: z.string().optional(),
  }),
  execute: async (params, ctx) => {
    await registerPlanIntent(ctx.userId, params.intent);

    if (params.intent === 'cancel') {
      return { registered: true };
    }

    const user = await findUserById(ctx.userId);
    if (!user) return { registered: true, needs_cpf: true };

    const result = await generateUpgradeCheckout(user, params.cpf_cnpj);
    if ('checkoutUrl' in result) return { registered: true, checkout_url: result.checkoutUrl };
    if ('invalidCpf' in result) return { registered: true, invalid_cpf: true };
    return { registered: true, needs_cpf: true };
  },
});
