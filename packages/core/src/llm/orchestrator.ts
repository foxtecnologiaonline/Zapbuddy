import type { User } from '@zapbuddy/db';
import {
  getAccountForUser,
  createAccountForUser,
  redeemAccountInvite,
  findAccountByReferralCode,
  recordReferral,
  listRecentCategorizedTransactions,
} from '@zapbuddy/db';
import { buildSystemPrompt } from './system-prompt.js';
import type { ToolContext } from './tool-types.js';
import { appendTurn, getRecentTurns } from '../context/conversation-context.js';
import { runLlmWithFallback } from './providers/orchestration.js';
import { MESSAGES } from '../messages.js';

export interface OrchestrateInput {
  user: User;
  messageText: string;
  messageSource: 'text' | 'audio';
}

export interface OrchestrateResult {
  replyText: string;
}

// Exportado pra poder ser reaproveitado por outros pontos de entrada que não
// passam pelo loop normal de mensagem de texto (ex.: document-upload.ts, que
// trata legenda de documento/imagem como possível tentativa de convite).
export const INVITE_CODE_MESSAGE_PATTERN = /^\s*entrar\s+(\d{4,8})\s*$/i;
// {6,8}: código de convite/indicação novo tem 6 chars (accounts.ts,
// REFERRAL_CODE_LENGTH), mas contas já existentes antes da Fase 3 foram
// migradas com código de 8 chars (migration 0009_referrals.sql, backfill a
// partir do uuid) — um quantificador fixo de 6 truncava e nunca batia com
// esses códigos legados, quebrando a atribuição de indicação pra toda conta
// anterior a esta rodada.
const REFERRAL_CODE_MESSAGE_PATTERN = /indicad[oa]\s+([a-z0-9]{6,8})/i;

/**
 * Resolve a conta (ADR 0002) do usuário, incluindo o fluxo de convite —
 * NUNCA uma decisão do LLM: decidir se um número de WhatsApp entra na conta
 * financeira de outra pessoa é regex determinística rodando antes de
 * qualquer chamada ao modelo, pelo mesmo motivo da regra "a IA nunca inventa
 * dado financeiro". Retorna null em `accountId` (via replyText fixo) quando
 * a mensagem era claramente uma tentativa de convite com código inválido —
 * nesse caso não criamos uma conta nova por engano, deixamos a pessoa tentar
 * de novo com o código certo.
 */
async function resolveAccount(
  user: User,
  messageText: string,
): Promise<{ accountId: string; role: 'owner' | 'member' } | { replyText: string }> {
  const existing = await getAccountForUser(user.id);
  if (existing) return existing;

  const inviteMatch = INVITE_CODE_MESSAGE_PATTERN.exec(messageText);
  const inviteCode = inviteMatch?.[1];
  if (inviteCode) {
    const redeemed = await redeemAccountInvite(inviteCode, user.id);
    if (redeemed) return redeemed;
    return { replyText: MESSAGES.inviteCodeInvalid };
  }

  const newAccount = await createAccountForUser(user.id);

  // Indicação é atribuição de métrica, não controle de acesso a dado
  // financeiro de terceiro (diferente do convite acima) — por isso não é
  // bloqueante: código não reconhecido simplesmente não gera o registro,
  // sem impedir nem atrasar o cadastro normal (ADR 0003, decisão 3).
  const referralMatch = REFERRAL_CODE_MESSAGE_PATTERN.exec(messageText);
  const referralCode = referralMatch?.[1];
  if (referralCode) {
    const referrerAccount = await findAccountByReferralCode(referralCode.toUpperCase());
    if (referrerAccount && referrerAccount.id !== newAccount.accountId) {
      await recordReferral(referrerAccount.id, newAccount.accountId);
    }
  }

  return newAccount;
}

/**
 * Roda um turno do WhatsApp: monta contexto (histórico curto prazo + system
 * prompt) e delega pro provider de LLM disponível (Anthropic primário,
 * OpenAI de fallback — ver providers/orchestration.ts) rodar o loop de tool
 * use e devolver o texto final.
 */
export async function orchestrateTurn(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { user, messageText, messageSource } = input;

  const account = await resolveAccount(user, messageText);
  if ('replyText' in account) {
    return { replyText: account.replyText };
  }

  const toolContext: ToolContext = {
    userId: user.id,
    whatsappNumber: user.whatsapp_number,
    messageSource,
    timezone: user.timezone,
    accountId: account.accountId,
    role: account.role,
  };

  const [history, recentCategorizations] = await Promise.all([
    getRecentTurns(user.whatsapp_number),
    listRecentCategorizedTransactions(account.accountId),
  ]);
  const system = buildSystemPrompt(user, recentCategorizations);

  const { replyText } = await runLlmWithFallback({
    system,
    history: history.map((turn) => ({ role: turn.role, content: turn.content })),
    userMessage: messageText,
    toolContext,
  });

  await appendTurn(user.whatsapp_number, { role: 'user', content: messageText, at: new Date().toISOString() });
  await appendTurn(user.whatsapp_number, { role: 'assistant', content: replyText, at: new Date().toISOString() });

  return { replyText };
}
