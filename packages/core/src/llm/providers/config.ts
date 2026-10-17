import { anthropicProvider } from './anthropic-provider.js';
import { openaiProvider } from './openai-provider.js';
import type { LlmProvider } from './types.js';

/**
 * Ordem de prioridade dos providers de LLM — mesmo padrão de
 * `config.ts`/`priority` do sistema multi-provider do mycollect
 * (`src/lib/vision/providers/`). Anthropic é o decidido em CLAUDE.md pra
 * produção; OpenAI só entra como rede de segurança quando o Anthropic falha
 * por qualquer motivo (créditos esgotados, 5xx, rate limit, etc. — foi
 * exatamente a falta disso que causou a indisponibilidade total já vista em
 * produção nesta sessão).
 */
export const LLM_PROVIDERS_BY_PRIORITY: LlmProvider[] = [anthropicProvider, openaiProvider];
