import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser } from '@zapbuddy/db';
import { getAudioTranscriptionQueue, getIncomingMessageQueue } from '@zapbuddy/core';

export const dynamic = 'force-dynamic';

/**
 * Webhook do canal opcional via Evolution API (ver amendamento no CLAUDE.md —
 * nunca o canal default). Formato de evento e taxonomia de mensagem (Baileys)
 * espelham o uso já em produção no ZapScript
 * (apps/api/src/routes/evolution-webhook.ts), restrito ao necessário aqui:
 * uma única instância global (EVOLUTION_INSTANCE_NAME), sem multi-tenant.
 */
interface EvolutionMessageKey {
  id: string;
  fromMe: boolean;
  remoteJid: string;
}

interface EvolutionWebhookBody {
  event?: string;
  instance?: string;
  data?: {
    key?: EvolutionMessageKey;
    messageType?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      audioMessage?: unknown;
      pttMessage?: unknown;
    };
  };
}

/**
 * Evolution não suporta headers customizados em webhooks — o secret vem como
 * query param (?secret=...), configurado na criação/registro da instância.
 * Sem secret configurado no ambiente, a requisição é sempre rejeitada (nunca
 * aceita webhook não-autenticado, mesmo nesse canal de contingência).
 *
 * Limitação inerente (vs. o HMAC por requisição do webhook oficial): é um
 * segredo estático na URL, não uma assinatura do corpo — se aparecer num log
 * de acesso/proxy, qualquer requisição com ele é aceita indefinidamente. Não
 * tem correção de código para isso (a Evolution não assina payload); mitigar
 * operacionalmente: EVOLUTION_WEBHOOK_SECRET longo/aleatório e nunca logar a
 * URL completa do webhook. instanceMatches() abaixo é defesa adicional.
 */
function isValidSecret(request: NextRequest): boolean {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!expected) return false;

  const provided = new URL(request.url).searchParams.get('secret');
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

/** Defesa em profundidade: rejeita evento de qualquer instância que não a configurada. */
function instanceMatches(instance: string | undefined): boolean {
  const expected = process.env.EVOLUTION_INSTANCE_NAME;
  return !!expected && instance === expected;
}

function isGroupJid(remoteJid: string): boolean {
  return remoteJid.endsWith('@g.us');
}

function extractPhone(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.WHATSAPP_CHANNEL_PROVIDER !== 'evolution') {
    // Canal desligado por padrão — só aceita tráfego quando explicitamente ativado.
    return new NextResponse('Evolution channel not enabled', { status: 404 });
  }
  if (!isValidSecret(request)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const body = (await request.json()) as EvolutionWebhookBody;

  if (!instanceMatches(body.instance)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Só processa mensagens individuais recebidas (messages.upsert, não-eco do
  // próprio número, não grupo — diferente da Cloud API oficial (sempre 1:1),
  // um número Baileys pode estar em grupos, e sem este filtro o JID de grupo
  // seria tratado como um número de telefone (dado financeiro mal atribuído).
  if (body.event !== 'messages.upsert' || !body.data?.key || body.data.key.fromMe) {
    return NextResponse.json({ received: true });
  }
  if (isGroupJid(body.data.key.remoteJid)) {
    return NextResponse.json({ received: true });
  }

  const { key, messageType, message } = body.data;
  const whatsappNumber = extractPhone(key.remoteJid);
  if (!whatsappNumber) return NextResponse.json({ received: true });

  const user = await getOrCreateUser(whatsappNumber);

  const text =
    messageType === 'conversation'
      ? message?.conversation
      : messageType === 'extendedTextMessage'
        ? message?.extendedTextMessage?.text
        : undefined;
  const audio = message?.audioMessage ?? message?.pttMessage;

  // jobId = id da mensagem: mesma proteção contra reentrega/duplicação do
  // webhook oficial (ver apps/web/app/api/whatsapp/webhook/route.ts).
  if (text) {
    await getIncomingMessageQueue().add(
      'process',
      { userId: user.id, whatsappNumber: user.whatsapp_number, text, waMessageId: key.id },
      { jobId: key.id },
    );
  } else if (audio) {
    await getAudioTranscriptionQueue().add(
      'transcribe',
      {
        userId: user.id,
        whatsappNumber: user.whatsapp_number,
        audioRef: { provider: 'evolution', raw: body.data },
        waMessageId: key.id,
      },
      { jobId: key.id },
    );
  }
  // Outros tipos (imagem, documento, etc.) estão fora do escopo do MVP.

  return NextResponse.json({ received: true });
}
