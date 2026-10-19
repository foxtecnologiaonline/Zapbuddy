import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { findUserByAsaasSubscriptionId, updateUserPlanStatus, logError, logger } from '@zapbuddy/db';

export const dynamic = 'force-dynamic';

// Confirmação de pagamento (PIX à vista, boleto compensado, cartão
// capturado) — qualquer um dos dois ativa a assinatura. Outros eventos
// (SUBSCRIPTION_*, PAYMENT_OVERDUE etc.) só são logados, sem ação — cancelar
// continua manual (register_plan_intent), não automático via webhook.
const CONFIRMATION_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

interface AsaasWebhookPayload {
  event?: string;
  payment?: {
    subscription?: string;
  };
}

/**
 * Asaas não assina o corpo (sem HMAC como a Meta) — a defesa é um token
 * fixo configurado manualmente no painel da Asaas (Integrações > Webhooks)
 * e comparado aqui em tempo constante, pro mesmo motivo do webhook do
 * WhatsApp: a URL é pública, então qualquer requisição que a conheça
 * poderia tentar ativar assinatura de qualquer conta sem isso.
 */
function isValidToken(received: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.headers.get('asaas-access-token');
  if (!isValidToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const payload = (await request.json()) as AsaasWebhookPayload;
  logger.info('asaas_webhook_received', { event: payload.event, subscription: payload.payment?.subscription });

  if (payload.event && CONFIRMATION_EVENTS.has(payload.event) && payload.payment?.subscription) {
    const user = await findUserByAsaasSubscriptionId(payload.payment.subscription);
    if (user && user.plan_status !== 'active') {
      await updateUserPlanStatus(user.id, 'active').catch((error: unknown) => {
        void logError({
          source: 'webhook',
          message: 'asaas_activate_plan_failed',
          detail: { error: error instanceof Error ? error.message : String(error), userId: user.id },
          userId: user.id,
        });
      });
    }
  }

  // Responde rápido (recomendação da própria Asaas) — qualquer falha de
  // ativação já foi logada acima, não vale a pena fazer a Asaas re-entregar
  // o mesmo evento por isso.
  return NextResponse.json({ ok: true });
}
