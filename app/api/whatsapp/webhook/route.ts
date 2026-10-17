import { handleWebhookRequest, InvalidWebhookSignatureError } from '../../../../src/webhook/handle-webhook';
import { logger } from '../../../../src/lib/logger';

// Passo 1 do cadastro do webhook na Meta: ela faz um GET de verificação
// antes de aceitar a URL, conferindo hub.verify_token contra o valor
// configurado no painel do app.
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && challenge && verifyToken && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-hub-signature-256');

  try {
    await handleWebhookRequest({ rawBody, signatureHeader });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return new Response('Invalid signature', { status: 403 });
    }

    logger.error('webhook.unhandled_error', { error });

    // 200 mesmo em erro interno: a Meta reentrega em não-200, e um bug não
    // se resolve virando retry — o erro já foi logado pra investigar.
    return new Response('OK', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}
