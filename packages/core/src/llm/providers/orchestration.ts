import { logger } from '@zapbuddy/db';
import { LLM_PROVIDERS_BY_PRIORITY } from './config.js';
import type { LlmProviderRunInput, LlmProviderRunResult } from './types.js';

/**
 * Tenta cada provider configurado em ordem de prioridade, caindo pro
 * próximo em qualquer erro (créditos, rate limit, timeout, 5xx — qualquer
 * motivo é tratado igual, já que o fallback troca de conta/vendor inteiro,
 * não é um retry no mesmo provedor). Espelha `orchestrateRecognition()` do
 * mycollect (`src/lib/vision/providers/orchestration.ts`).
 */
export async function runLlmWithFallback(input: LlmProviderRunInput): Promise<LlmProviderRunResult> {
  const configured = LLM_PROVIDERS_BY_PRIORITY.filter((provider) => provider.isConfigured());
  if (configured.length === 0) {
    throw new Error('Nenhum provider de LLM configurado (ANTHROPIC_API_KEY / OPENAI_API_KEY)');
  }

  let lastError: unknown;
  for (const [index, provider] of configured.entries()) {
    const startedAt = Date.now();
    try {
      const result = await provider.run(input);
      if (index > 0) {
        // Só loga explicitamente quando um fallback foi de fato usado —
        // o caminho feliz (primeiro provider, sempre) não precisa de ruído.
        logger.warn('llm_provider_fallback_used', {
          provider: provider.name,
          userId: input.toolContext.userId,
          latencyMs: Date.now() - startedAt,
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logger.error('llm_provider_failed', {
        provider: provider.name,
        userId: input.toolContext.userId,
        error: message,
        willRetryWithNextProvider: index < configured.length - 1,
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Todos os providers de LLM falharam');
}
