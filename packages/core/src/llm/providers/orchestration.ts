import { logger } from '@zapbuddy/db';
import { MESSAGES } from '../../messages.js';
import { sendWhatsappTextMessage } from '../../whatsapp/channel.js';
import { LLM_PROVIDERS_BY_PRIORITY } from './config.js';
import type { LlmProviderRunInput, LlmProviderRunResult } from './types.js';

// Nenhum timeout aborta o processamento — só avisa o usuário que o bot ainda
// está vendo a mensagem, pra silêncio (ex.: Anthropic/OpenAI engasgando, ou
// o fallback inteiro sendo tentado) não parecer que o bot sumiu. 8s é bem
// acima da latência normal de 1 iteração, então só dispara em turno
// realmente lento. Fica aqui (não em cada provider) porque cobre a
// tentativa inteira, incluindo a troca pro fallback.
export const INTERIM_NOTICE_MS = 8_000;

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

  // Só dispara se a tentativa inteira (todos os providers, na ordem de
  // prioridade) ainda não tiver terminado em INTERIM_NOTICE_MS — cancelado
  // no finally abaixo assim que há uma resposta real pra enviar.
  let interimTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    interimTimer = null;
    void sendWhatsappTextMessage(input.toolContext.whatsappNumber, MESSAGES.stillProcessing).catch((error) => {
      logger.error('interim_notice_failed', {
        userId: input.toolContext.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, INTERIM_NOTICE_MS);

  try {
    let lastError: unknown;
    for (const [index, provider] of configured.entries()) {
      const startedAt = Date.now();
      try {
        const result = await provider.run(input);
        const latencyMs = Date.now() - startedAt;
        // Latência de toda chamada LLM (não só quando cai no fallback) — sem
        // isso, uma lentidão percebida pelo usuário não dava pra distinguir
        // entre "o Claude está lento" e "uma tool específica está lenta"
        // (ver duration_ms em tool_call_logs, tool-runner.ts). `usage` (ver
        // sugestão #2 da revisão de performance 2026-10) é o único jeito de
        // provar se o cache em camadas (sugestão #1) está funcionando de
        // verdade — sem logar isso, cache_read_input_tokens nunca aparece
        // em lugar nenhum pra verificar.
        logger.info('llm_call_completed', {
          provider: provider.name,
          userId: input.toolContext.userId,
          latencyMs,
          usedFallback: index > 0,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          cacheReadInputTokens: result.usage?.cacheReadInputTokens,
          cacheCreationInputTokens: result.usage?.cacheCreationInputTokens,
        });
        if (index > 0) {
          // Só loga em warn quando um fallback foi de fato usado — o caminho
          // feliz (primeiro provider, sempre) já foi registrado acima em info.
          logger.warn('llm_provider_fallback_used', {
            provider: provider.name,
            userId: input.toolContext.userId,
            latencyMs,
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
  } finally {
    if (interimTimer) clearTimeout(interimTimer);
  }
}
