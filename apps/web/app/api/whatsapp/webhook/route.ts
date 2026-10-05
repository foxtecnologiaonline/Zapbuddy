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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const payload = (await request.json()) as WhatsappWebhookPayload;

  const messages = payload.entry?.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? []) ?? [];

  for (const message of messages) {
    const user = await getOrCreateUser(message.from);

    if (message.type === 'text' && message.text) {
      await getIncomingMessageQueue().add('process', {
        userId: user.id,
        whatsappNumber: user.whatsapp_number,
        text: message.text.body,
        waMessageId: message.id,
      });
    } else if (message.type === 'audio' && message.audio) {
      await getAudioTranscriptionQueue().add('transcribe', {
        userId: user.id,
        whatsappNumber: user.whatsapp_number,
        mediaId: message.audio.id,
        waMessageId: message.id,
      });
    }
    // Outros tipos (imagem, documento, etc.) estão fora do escopo do MVP.
  }

  // Meta exige resposta 200 rápida; o processamento real acontece no worker via fila.
  return NextResponse.json({ received: true });
}
