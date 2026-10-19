import type { ToolContext } from '../tool-types.js';
import type { SystemPromptBlocks } from '../system-prompt.js';

export interface LlmConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmProviderRunInput {
  /** 3 camadas (estável/semi-estável/volátil) em vez de string única — ver system-prompt.ts e a sugestão #1 da revisão de performance 2026-10 (cache_control granular). */
  system: SystemPromptBlocks;
  history: LlmConversationTurn[];
  userMessage: string;
  toolContext: ToolContext;
}

/**
 * `usage` é opcional porque nem todo provider expõe os 4 contadores da
 * mesma forma (a OpenAI não devolve cache_read/cache_creation na Chat
 * Completions API) — sem isso, não dava pra medir se a sugestão #1 (cache
 * em camadas) está de fato funcionando (ver sugestão #2 da revisão de
 * performance 2026-10).
 */
export interface LlmProviderRunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface LlmProviderRunResult {
  replyText: string;
  usage?: LlmProviderRunUsage;
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
