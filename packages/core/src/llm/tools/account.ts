import { z } from 'zod';
import {
  createAccountInvite,
  listAccountMembers,
  getReferralStats,
  registerPlanIntent,
  findUserById,
  saveUserCpfCnpj,
  saveAsaasSubscription,
} from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { createAsaasCustomer, createAsaasSubscription } from '../../payments/asaas-client.js';

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
    'ter chamado a tool, igual vale pra dado financeiro.\n' +
    '- intent "cancel": não cancela nada sozinho — só avisa um humano, que confirma manualmente.\n' +
    '- intent "upgrade": gera um checkout REAL (Asaas, R$ 27,90/mês, PIX/boleto/cartão à escolha da ' +
    'pessoa na própria página). Exige CPF ou CNPJ (exigência da Asaas, não sua) — se ainda não tiver, ' +
    'o retorno vem com needs_cpf: true; peça o CPF/CNPJ e chame de novo com cpf_cnpj preenchido. ' +
    'Quando vier checkout_url, mande esse link pra ela — nunca invente outro valor, prazo "que acaba ' +
    'hoje" ou prova social que você não tenha de verdade.',
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

    if (user.asaas_subscription_id && user.asaas_payment_link) {
      return { registered: true, checkout_url: user.asaas_payment_link };
    }

    const cpfCnpj = params.cpf_cnpj ?? user.cpf_cnpj ?? undefined;
    if (!cpfCnpj) {
      return { registered: true, needs_cpf: true };
    }
    if (params.cpf_cnpj && params.cpf_cnpj !== user.cpf_cnpj) {
      await saveUserCpfCnpj(ctx.userId, params.cpf_cnpj);
    }

    const customer = user.asaas_customer_id
      ? { id: user.asaas_customer_id }
      : await createAsaasCustomer({
          name: user.preferred_name ?? user.name ?? 'Cliente ZapBuddy',
          cpfCnpj,
          externalReference: user.id,
        });

    const subscription = await createAsaasSubscription({ customerId: customer.id, externalReference: user.id });
    await saveAsaasSubscription(ctx.userId, customer.id, subscription.id, subscription.paymentLink);

    return { registered: true, checkout_url: subscription.paymentLink };
  },
});
