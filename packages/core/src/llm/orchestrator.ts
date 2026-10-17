import type { User } from '@zapbuddy/db';
import { buildSystemPrompt } from './system-prompt.js';
import type { ToolContext } from './tool-types.js';
import { appendTurn, getRecentTurns } from '../context/conversation-context.js';
import { runLlmWithFallback } from './providers/orchestration.js';

export interface OrchestrateInput {
  user: User;
  messageText: string;
  messageSource: 'text' | 'audio';
}

export interface OrchestrateResult {
  replyText: string;
}

/**
 * Roda um turno do WhatsApp: monta contexto (histórico curto prazo + system
 * prompt) e delega pro provider de LLM disponível (Anthropic primário,
 * OpenAI de fallback — ver providers/orchestration.ts) rodar o loop de tool
 * use e devolver o texto final.
 */
export async function orchestrateTurn(input: OrchestrateInput): Promise<OrchestrateResult> {
  const { user, messageText, messageSource } = input;
  const toolContext: ToolContext = {
    userId: user.id,
    whatsappNumber: user.whatsapp_number,
    messageSource,
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
