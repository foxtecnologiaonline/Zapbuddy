import { findClientByWhatsAppId, createClient } from '../repositories/clients';
import type { Client } from '../types/client';

export function normalizeWhatsAppId(rawFrom: string): string {
  return rawFrom.replace(/\D/g, '');
}

export type InboundRoute =
  | { kind: 'onboarding'; client: Client }
  | { kind: 'orchestrator'; client: Client };

/**
 * Primeiro passo de todo webhook recebido: decide se o número é um cliente
 * já cadastrado (vai pro orquestrador da IA) ou precisa de onboarding
 * (cliente novo ou que começou e não terminou o cadastro).
 */
export async function resolveClientForInboundMessage(rawFrom: string): Promise<InboundRoute> {
  const whatsappId = normalizeWhatsAppId(rawFrom);

  let client = await findClientByWhatsAppId(whatsappId);

  if (!client) {
    client = await createClient(whatsappId);
  }

  if (client.status === 'onboarding') {
    return { kind: 'onboarding', client };
  }

  return { kind: 'orchestrator', client };
}
