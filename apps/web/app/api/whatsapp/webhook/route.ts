import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@zapbuddy/db';
import { getAudioTranscriptionQueue, getIncomingMessageQueue } from '@zapbuddy/core';

export const dynamic = 'force-dynamic';

/** Handshake de verificação do webhook, exigido pela Meta ao configurar o app. */
export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          audio?: { id: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Valida a assinatura HMAC que a Meta envia em todo POST (X-Hub-Signature-256,
 * calculada com o App Secret). Sem isso, qualquer requisição que conheça a URL
 * pública do webhook poderia injetar mensagens fabricadas em nome de um
 * usuário real — inaceitável para um bot que grava dados financeiros.
 */
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const payload = JSON.parse(rawBody) as WhatsappWebhookPayload;

  const messages = payload.entry?.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? []) ?? [];

  for (const message of messages) {
    const user = await getOrCreateUser(message.from);

    // jobId = id da mensagem do WhatsApp: a Meta reentrega webhooks em caso de
    // timeout/erro, e sem dedupe isso duplicaria o processamento (e, pior,
    // transações financeiras) para a mesma mensagem.
    if (message.type === 'text' && message.text) {
      await getIncomingMessageQueue().add(
        'process',
        {
          userId: user.id,
          whatsappNumber: user.whatsapp_number,
          text: message.text.body,
          waMessageId: message.id,
        },
        { jobId: message.id },
      );
    } else if (message.type === 'audio' && message.audio) {
      await getAudioTranscriptionQueue().add(
        'transcribe',
        {
          userId: user.id,
          whatsappNumber: user.whatsapp_number,
          audioRef: { provider: 'cloud-api', mediaId: message.audio.id },
          waMessageId: message.id,
        },
        { jobId: message.id },
      );
    }
    // Outros tipos (imagem, documento, etc.) estão fora do escopo do MVP.
  }

  // Meta exige resposta 200 rápida; o processamento real acontece no worker via fila.
  return NextResponse.json({ received: true });
}
