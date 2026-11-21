/**
 * Erros da integração de calendário (Google e Outlook). Duas regras, as duas vindas da auditoria de 2026-11:
 *
 * 1. Token morto (revogado, expirado, senha trocada) é um estado ESPERADO, não uma falha qualquer: vira
 *    `CalendarAuthError`, e quem chama trata como "agenda desconectada" em vez de repetir a falha todo dia.
 * 2. O corpo cru da resposta do provedor nunca vai pra mensagem de erro: ele chegava ao modelo (que podia repassar o
 *    JSON pra pessoa) e aos logs, com id de evento e de requisição. A mensagem é curta e truncada.
 */

/** Refresh token inválido: revogado pela pessoa, expirado (Outlook ~90 dias) ou invalidado por troca de senha. */
export class CalendarAuthError extends Error {
  constructor(provider: string) {
    super(`A conexão com ${provider} expirou ou foi revogada: é preciso reconectar a agenda.`);
    this.name = 'CalendarAuthError';
  }
}

/** Falha da API do provedor, com mensagem curta e segura pra ir ao modelo e aos logs. */
export class CalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

const MAX_PROVIDER_MESSAGE = 160;

/** Tira do corpo de erro só o texto legível (Google `error.message`, Graph `error.message`, OAuth `error_description`), truncado. */
export function extractProviderMessage(body: string): string {
  let text = body;
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string }; error_description?: string; message?: string };
    const nested = typeof parsed.error === 'object' ? parsed.error?.message : undefined;
    text = nested ?? parsed.error_description ?? (typeof parsed.error === 'string' ? parsed.error : undefined) ?? parsed.message ?? '';
  } catch {
    // não é JSON: usa o texto como veio
  }
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_PROVIDER_MESSAGE ? `${flat.slice(0, MAX_PROVIDER_MESSAGE)}…` : flat;
}

/**
 * O endpoint de token responde assim quando o refresh token não vale mais. `interaction_required` é a Microsoft pedindo
 * novo login (acesso condicional / senha trocada). `invalid_client` NÃO entra: é configuração nossa, não da pessoa.
 */
export function isDeadGrant(status: number, body: string): boolean {
  return (status === 400 || status === 401) && /"error"\s*:\s*"(invalid_grant|interaction_required)"/.test(body);
}

/** Lança o erro certo pra uma resposta não-ok do endpoint de token. */
export async function failTokenResponse(providerLabel: string, response: Response): Promise<never> {
  const body = await response.text();
  if (isDeadGrant(response.status, body)) throw new CalendarAuthError(providerLabel);
  throw new CalendarApiError(`${providerLabel}: pedido de token falhou (${response.status}): ${extractProviderMessage(body)}`, response.status);
}

/** Lança `CalendarApiError` curto e seguro pra uma resposta não-ok da API de agenda. */
export async function failApiResponse(action: string, response: Response): Promise<never> {
  const body = await response.text();
  throw new CalendarApiError(`${action} falhou (${response.status}): ${extractProviderMessage(body)}`, response.status);
}
