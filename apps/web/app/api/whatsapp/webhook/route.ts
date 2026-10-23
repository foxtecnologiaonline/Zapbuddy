import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, InvalidWhatsappNumberError, logError, logWebhookEvent, logger } from '@zapbuddy/db';
import {
  getAudioTranscriptionQueue,
  getIncomingMessageQueue,
  getDocumentUploadQueue,
  isRateLimited,
  routeRecipientReply,
  applyDeliveryStatuses,
  formatSharedContactText,
  type DeliveryStatusLike,
  type SharedContactLike,
} from '@zapbuddy/core';

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
          document?: { id: string; filename?: string; mime_type?: string; caption?: string };
          image?: { id: string; mime_type?: string; caption?: string };
          contacts?: SharedContactLike[];
        }>;
        statuses?: DeliveryStatusLike[];
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
    await logWebhookEvent({ channel: 'cloud-api', eventType: 'rejected', status: 'rejected', rejectionReason: 'invalid signature' });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const payload = JSON.parse(rawBody) as WhatsappWebhookPayload;

  const messages = payload.entry?.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? []) ?? [];

  // Status de entrega dos recados a terceiros (entregue/lido/falhou). Só atualiza o log; nunca derruba o webhook.
  const statuses = payload.entry?.flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.statuses ?? []) ?? [];
  if (statuses.length > 0) await applyDeliveryStatuses(statuses);

  for (const message of messages) {
    // Cada mensagem é tratada isoladamente: uma falha numa não deve impedir o
    // processamento das demais nem a resposta 200 rápida que a Meta exige.
    try {
      // Resposta a um recado do Tom vindo de quem ainda NÃO é usuário: vira log + aviso a quem pediu,
      // nunca uma conta nova com onboarding (ver packages/core/src/contacts/replies.ts).
      if (await routeRecipientReply({ id: message.id, from: message.from, type: message.type, text: message.text?.body })) {
        await logWebhookEvent({ channel: 'cloud-api', whatsappNumber: message.from, eventType: 'other', status: 'accepted' });
        continue;
      }

      const user = await getOrCreateUser(message.from);

      // Checado por número já resolvido (não message.from direto) pra cobrir
      // igual os dois canais (cloud-api/evolution) com a mesma chave — ver
      // packages/core/src/security/rate-limit.ts.
      if (await isRateLimited(user.whatsapp_number)) {
        logger.warn('rate_limited', { whatsappNumber: user.whatsapp_number, waMessageId: message.id });
        continue;
      }

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
        await logWebhookEvent({ channel: 'cloud-api', whatsappNumber: user.whatsapp_number, eventType: 'text', status: 'accepted' });
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
        await logWebhookEvent({ channel: 'cloud-api', whatsappNumber: user.whatsapp_number, eventType: 'audio', status: 'accepted' });
      } else if ((message.type === 'document' && message.document) || (message.type === 'image' && message.image)) {
        const media = message.type === 'document' ? message.document! : message.image!;
        const fileName = message.type === 'document' ? (media as { filename?: string }).filename ?? 'arquivo' : 'imagem.jpg';
        await getDocumentUploadQueue().add(
          'upload',
          {
            userId: user.id,
            whatsappNumber: user.whatsapp_number,
            mediaRef: { provider: 'cloud-api', mediaId: media.id },
            fileName,
            caption: media.caption,
            waMessageId: message.id,
          },
          { jobId: message.id },
        );
        await logWebhookEvent({ channel: 'cloud-api', whatsappNumber: user.whatsapp_number, eventType: 'document', status: 'accepted' });
      } else if (message.type === 'contacts' && message.contacts) {
        // Cartão de contato encaminhado pela pessoa: o Tom oferece salvar (save_contact), pra poder mandar recados.
        const sharedText = formatSharedContactText(message.contacts);
        if (sharedText) {
          await getIncomingMessageQueue().add(
            'process',
            { userId: user.id, whatsappNumber: user.whatsapp_number, text: sharedText, waMessageId: message.id },
            { jobId: message.id },
          );
        }
        await logWebhookEvent({ channel: 'cloud-api', whatsappNumber: user.whatsapp_number, eventType: 'other', status: 'accepted' });
      } else {
        // Outros tipos (sticker, localização, contato, etc.) estão fora do escopo da Fase 2.
        await logWebhookEvent({ channel: 'cloud-api', whatsappNumber: user.whatsapp_number, eventType: 'other', status: 'accepted' });
      }
    } catch (error) {
      if (error instanceof InvalidWhatsappNumberError) {
        // Payload malformado (ex.: JID de grupo mal filtrado por um provider,
        // campo vazio) não deve virar registro no banco nem derrubar o
        // webhook inteiro — pula só esta mensagem. Não é falha de sistema,
        // então não vai pro card "Erros" do admin, só warn estruturado.
        logger.warn('invalid_whatsapp_number', { from: message.from, waMessageId: message.id });
        continue;
      }
      const message_ = error instanceof Error ? error.message : String(error);
      logger.error('webhook_message_failed', { waMessageId: message.id, error: message_ });
      await logError({ source: 'webhook', message: message_, detail: { waMessageId: message.id, from: message.from } });
    }
  }

  // Meta exige resposta 200 rápida; o processamento real acontece no worker via fila.
  return NextResponse.json({ received: true });
}
