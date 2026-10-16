const RETRY_BACKOFF_MS = 1_000;

/**
 * fetch com timeout e 1 retry — só pra falha transitória (5xx, timeout, erro
 * de rede). Nunca retenta 4xx (ex.: token inválido, número bloqueado): nesses
 * casos a mesma requisição malformada/não-autorizada falha de novo, e
 * retentar só atrasa o erro chegar no caller. Complementa (não substitui) o
 * retry no nível do job do BullMQ (DEFAULT_JOB_OPTIONS): evita rodar a IA de
 * novo só porque o envio HTTP teve um blip passageiro.
 */
export async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isLastAttempt = attempt === 1;
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || response.status < 500 || isLastAttempt) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (isLastAttempt) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
  }
  throw lastError;
}
