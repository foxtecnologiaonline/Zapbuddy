import { findClientByWhatsAppId, createClient } from '../repositories/clients';
import type { Client } from '../types/client';

export class InvalidPhoneNumberError extends Error {}

const MIN_DIGITS = 10; // DDI + DDD + número, ex: 5511999999999 tem 13
const MAX_DIGITS = 15; // limite do padrão E.164

export function normalizeWhatsAppId(rawFrom: string): string {
  const digits = rawFrom.replace(/\D/g, '');

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
    throw new InvalidPhoneNumberError(`Número de telefone com formato inválido: "${rawFrom}"`);
  }

  return digits;
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
