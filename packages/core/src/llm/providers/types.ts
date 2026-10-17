import type { ToolContext } from '../tool-types.js';

export interface LlmConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmProviderRunInput {
  system: string;
  history: LlmConversationTurn[];
  userMessage: string;
  toolContext: ToolContext;
}

export interface LlmProviderRunResult {
  replyText: string;
}

/**
 * Abstração de provider de LLM — espelha o padrão de
 * `vision/providers/{vision,extraction}/*` do mycollect (config.ts +
 * orchestration.ts com fallback por prioridade). Cada provider roda seu
 * próprio loop de tool-use internamente (formato de mensagem/tool-call é
 * específico de cada um) e devolve só o texto final — o histórico curto
 * prazo (conversation-context.ts) já é texto puro, então trocar de provider
 * entre turnos não exige tradução de estado.
 */
export interface LlmProvider {
  name: string;
  isConfigured(): boolean;
  run(input: LlmProviderRunInput): Promise<LlmProviderRunResult>;
}
