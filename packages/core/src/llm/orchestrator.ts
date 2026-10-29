import type { User } from '@zapbuddy/db';
import {
  logger,
  getConversationSummary,
  getAccountForUser,
  createAccountForUser,
  redeemAccountInvite,
  findAccountByReferralCode,
  recordReferral,
  listRecentCategorizedTransactions,
  listMemoryFacts,
} from '@zapbuddy/db';
import { buildSystemPromptBlocks } from './system-prompt.js';
import type { ToolContext } from './tool-types.js';
import { appendTurns, getRecentTurns } from '../context/conversation-context.js';
import { getCurrentStreakDays } from '../streak/compute.js';
import { runLlmWithFallback } from './providers/orchestration.js';
import { MESSAGES } from '../messages.js';
import { isAccessBlocked, handleBlockedMessage } from '../payments/trial-gate.js';
import { parseCommand } from '../commands/parse.js';
import { executeCommand } from '../commands/execute.js';
import { GRATITUDE_REACTION, isGratitudeOnly, lastAssistantAskedQuestion } from '../conversation/ack.js';
import { analyzeStyle, formatStyleBlock } from '../conversation/style.js';
import { formatSummaryBlock, updateConversationSummaryIfNeeded } from '../conversation/summary.js';

export interface OrchestrateInput {
  user: User;
  messageText: string;
  messageSource: 'text' | 'audio';
}

export interface OrchestrateResult {
  replyText: string;
  /** Emoji pra reagir à mensagem da pessoa no lugar de mandar texto (agradecimento puro); replyText vira o texto curto de reserva se a reação não puder ser enviada. */
  reaction?: string;
  /** Trabalho de manutenção pra rodar DEPOIS da resposta enviada (ex.: resumo da conversa). Nunca lança. */
  afterSend?: () => Promise<void>;
}

const GRATITUDE_FALLBACKS = ['Por nada! 🙂', 'Imagina, tô aqui pra isso!', 'Sempre que precisar 🤝'];

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

  // Bloqueio real de trial encerrado/cancelamento (2026-10, CLAUDE.md) —
  // roda ANTES de resolver conta ou montar prompt: ninguém bloqueado chega
  // a custar uma chamada de LLM.
  if (isAccessBlocked(user)) {
    return handleBlockedMessage(user, messageText);
  }

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

  const onboarded = Boolean(user.onboarding_completed_at);

  // O histórico vem primeiro porque decide dois atalhos: se o Tom acabou de fazer uma
  // pergunta, a resposta curta da pessoa ("amanhã", "hoje", "foco", "valeu") é a RESPOSTA —
  // nunca um comando nem só um agradecimento.
  const history = await getRecentTurns(user.whatsapp_number);
  const answeringQuestion = lastAssistantAskedQuestion(history);

  // Comandos diretos (sugestão #13): mensagem inteira e exata, sem LLM — resposta
  // instantânea e sem custo de token. Só depois do onboarding (antes dele o Tom conduz
  // a conversa). Falha ou "não sei resolver" cai no LLM normalmente.
  if (onboarded && !answeringQuestion) {
    const command = parseCommand(messageText);
    if (command) {
      try {
        const commandReply = await executeCommand(command, { user, toolContext });
        if (commandReply) {
          const at = new Date().toISOString();
          await appendTurns(user.whatsapp_number, [
            { role: 'user', content: messageText, at },
            { role: 'assistant', content: commandReply, at },
          ]);
          logger.info('direct_command_handled', { userId: user.id, command: command.kind });
          return { replyText: commandReply };
        }
      } catch (error) {
        logger.warn('direct_command_failed', { userId: user.id, command: command.kind, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const [recentCategorizations, streakDays, memoryFacts, summary] = await Promise.all([
    listRecentCategorizedTransactions(account.accountId),
    getCurrentStreakDays(account.accountId, user.timezone),
    listMemoryFacts(account.accountId),
    // Resumo da conversa é bônus: tabela ausente/erro nunca pode impedir a resposta.
    onboarded ? getConversationSummary(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  // Agradecimento puro vira reação (sugestão #3) — a menos que o Tom tenha acabado de
  // fazer uma pergunta ("valeu, pode ser" é resposta, não só agradecimento).
  if (onboarded && isGratitudeOnly(messageText) && !answeringQuestion) {
    const at = new Date().toISOString();
    await appendTurns(user.whatsapp_number, [
      { role: 'user', content: messageText, at },
      { role: 'assistant', content: GRATITUDE_REACTION, at },
    ]);
    return { replyText: GRATITUDE_FALLBACKS[history.length % GRATITUDE_FALLBACKS.length]!, reaction: GRATITUDE_REACTION };
  }

  const styleBlock = onboarded
    ? formatStyleBlock(analyzeStyle([...history.filter((turn) => turn.role === 'user').map((turn) => turn.content), messageText].slice(-12)))
    : '';
  const system = buildSystemPromptBlocks(user, recentCategorizations, streakDays, memoryFacts, {
    conversationSummary: summary?.summary ?? null,
    styleBlock,
  });

  const { replyText } = await runLlmWithFallback({
    system,
    history: history.map((turn) => ({ role: turn.role, content: turn.content })),
    userMessage: messageText,
    toolContext,
  });

  const userTurn = { role: 'user' as const, content: messageText, at: new Date().toISOString() };
  const assistantTurn = { role: 'assistant' as const, content: replyText, at: new Date().toISOString() };
  await appendTurns(user.whatsapp_number, [userTurn, assistantTurn]);

  // Resumo rolante da conversa (sugestão #4): depois da resposta já enviada, usando o
  // histórico que já temos em mãos (nenhuma leitura extra do Redis).
  const afterSend = onboarded
    ? async () => {
        await updateConversationSummaryIfNeeded(user.id, [...history, userTurn, assistantTurn], summary);
      }
    : undefined;

  return { replyText, afterSend };
}
