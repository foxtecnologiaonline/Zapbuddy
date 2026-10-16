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

export type RouteKind = 'onboarding' | 'orchestrator';

export type InboundRoute = { kind: RouteKind; client: Client };

// Centraliza a regra "quem é onboarding, quem é orquestrador" — usada tanto
// aqui (resolução síncrona no webhook) quanto no worker da fila, que
// re-deriva a rota a partir do estado atual do cliente a cada job.
export function routeKindForClient(client: Client): RouteKind {
  return client.status === 'onboarding' ? 'onboarding' : 'orchestrator';
}

/**
 * Primeiro passo de todo webhook recebido: garante que o número existe como
 * cliente (cria se for o primeiro contato) e decide se vai pro fluxo de
 * onboarding ou pro orquestrador de IA.
 */
export async function resolveClientForInboundMessage(rawFrom: string): Promise<InboundRoute> {
  const whatsappId = normalizeWhatsAppId(rawFrom);

  let client = await findClientByWhatsAppId(whatsappId);

  if (!client) {
    client = await createClient(whatsappId);
  }

  return { kind: routeKindForClient(client), client };
}
