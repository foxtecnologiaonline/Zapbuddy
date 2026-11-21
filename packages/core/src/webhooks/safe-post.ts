import { request } from 'node:https';
import { SSRF_BLOCKED_CODE, isSafeWebhookUrlSyntax, publicOnlyLookup } from '../security/ssrf-guard.js';

const RETRY_BACKOFF_MS = 1_000;

export interface SafePostResult {
  ok: boolean;
  status: number;
}

function postOnce(url: URL, body: string, headers: Record<string, string>, timeoutMs: number): Promise<SafePostResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        // Validação do IP no momento da conexão (anti DNS rebinding) — ver ssrf-guard.ts.
        lookup: publicOnlyLookup,
        signal: AbortSignal.timeout(timeoutMs),
      },
      (response) => {
        response.resume(); // o corpo da resposta não interessa; só o status
        const status = response.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * POST JSON pra uma URL fornecida por usuário, sem alcançar rede interna:
 * valida o formato, resolve o DNS uma única vez (já validando o IP) e nunca segue redirect
 * (`https.request` não segue; um 302 chega aqui como resposta não-2xx).
 * Mesma política de `fetchWithRetry`: 1 retry só pra falha transitória (rede, timeout, 5xx),
 * e nunca pra bloqueio de SSRF, que falharia de novo igual.
 */
export async function postJsonToPublicHttps(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
  backoffMs: number = RETRY_BACKOFF_MS,
): Promise<SafePostResult> {
  if (!isSafeWebhookUrlSyntax(rawUrl)) throw new Error('URL de webhook não permitida');
  const url = new URL(rawUrl);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isLastAttempt = attempt === 1;
    try {
      const result = await postOnce(url, body, headers, timeoutMs);
      if (result.ok || result.status < 500 || isLastAttempt) return result;
      lastError = new Error(`HTTP ${result.status}`);
    } catch (error) {
      if (isLastAttempt || (error as { code?: string }).code === SSRF_BLOCKED_CODE) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
  throw lastError;
}
