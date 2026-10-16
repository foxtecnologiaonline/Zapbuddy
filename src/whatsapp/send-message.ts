const GRAPH_API_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

export class WhatsAppApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`Falha ao enviar mensagem WhatsApp (${status}): ${body}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Até 2 tentativas: retry só em 5xx/timeout/falha de rede (coisas transitórias
// da Meta). Erro 4xx (token inválido, número inválido etc) nunca tem retry —
// tentar de novo não resolve.
export async function sendWhatsAppTextMessage(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN são obrigatórios');
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS;

    try {
      const response = await postMessage(phoneNumberId, accessToken, to, body);

      if (response.ok) return;

      const errorBody = await response.text();
      const isRetryable = response.status >= 500;

      if (!isRetryable || isLastAttempt) {
        throw new WhatsAppApiError(response.status, errorBody);
      }
    } catch (error) {
      if (error instanceof WhatsAppApiError || isLastAttempt) throw error;
      // timeout (AbortError) ou falha de rede antes de obter resposta: vale retry.
    }

    await sleep(RETRY_DELAY_MS);
  }
}

// Várias mensagens em sequência (ex: boas-vindas em duas bolhas), na ordem dada.
export async function sendWhatsAppTextMessages(to: string, bodies: string[]): Promise<void> {
  for (const body of bodies) {
    await sendWhatsAppTextMessage(to, body);
  }
}
