import type { User } from '@zapbuddy/db';
import { getAccountForUser, createAccountForUser, redeemAccountInvite } from '@zapbuddy/db';
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

const INVITE_CODE_MESSAGE_PATTERN = /^\s*entrar\s+(\d{4,8})\s*$/i;

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

  return createAccountForUser(user.id);
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

  const history = await getRecentTurns(user.whatsapp_number);
  const system = buildSystemPrompt(user);

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
