import { getRedisConnection } from '../redis.js';

const WINDOW_SECONDS = 60;
// Nenhum humano manda 20 mensagens de WhatsApp em 1 minuto — isto não é um
// limite esperado em uso normal, é proteção contra um número comprometido ou
// uma automação externa inundando a fila (e, no fim, a conta de LLM/Whisper).
const MAX_MESSAGES_PER_WINDOW = 20;

function key(whatsappNumber: string): string {
  return `ratelimit:msg:${whatsappNumber}`;
}

/**
 * INCR + EXPIRE num script só (atômico, e 1 round-trip em vez de 2 na primeira mensagem). Antes eram dois comandos: se o
 * EXPIRE falhasse logo depois do INCR (a cota do Upstash já estourou duas vezes), a chave ficava SEM validade e, passadas 20
 * mensagens no total, a pessoa era bloqueada para sempre e em silêncio. O `TTL < 0` também cura uma chave que já tenha ficado assim.
 */
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

async function incrementWithWindow(key: string, windowSeconds: number): Promise<number> {
  const count = await getRedisConnection().eval(INCR_WITH_TTL, 1, key, windowSeconds);
  return Number(count);
}

/**
 * Janela fixa simples por número, a ser checada pelos webhooks do WhatsApp antes de enfileirar qualquer mensagem. Redis já é
 * dependência obrigatória do projeto (filas/contexto), então isto não introduz infraestrutura nova.
 */
export async function isRateLimited(whatsappNumber: string): Promise<boolean> {
  return (await incrementWithWindow(key(whatsappNumber), WINDOW_SECONDS)) > MAX_MESSAGES_PER_WINDOW;
}

const LOGIN_WINDOW_SECONDS = 15 * 60;
// ADMIN_PASSWORD é uma senha única e compartilhada (não por usuário) —
// sem limite de tentativas, o painel admin (que expõe contato/telefone de
// clientes) fica vulnerável a força bruta. Comparação em si já é em tempo
// constante (admin-session.ts); isto cobre o volume de tentativas.
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 5;

function loginKey(identifier: string): string {
  return `ratelimit:admin-login:${identifier}`;
}

/** Janela fixa por IP (ou outro identificador do cliente) pras tentativas de login do admin. */
export async function isAdminLoginRateLimited(identifier: string): Promise<boolean> {
  return (await incrementWithWindow(loginKey(identifier), LOGIN_WINDOW_SECONDS)) > MAX_LOGIN_ATTEMPTS_PER_WINDOW;
}
