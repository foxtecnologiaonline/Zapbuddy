import { createHmac, timingSafeEqual } from 'node:crypto';

const ADMIN_SESSION_COOKIE_NAME = 'zapbuddy_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h — sessão de operação, não de cliente final

interface AdminSessionPayload {
  admin: true;
  exp: number;
}

/**
 * Reaproveita SESSION_SECRET (já obrigatório pro resto do app) em vez de pedir
 * uma variável de ambiente nova só pra isto — mesmo HMAC, finalidade
 * diferente (cookie com nome e payload próprios, nunca aceito como sessão de
 * usuário comum nem vice-versa).
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET must be set');
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

export function createAdminSessionCookieValue(): string {
  const payload: AdminSessionPayload = { admin: true, exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function isAdminSessionCookieValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const [encoded, signature] = cookieValue.split('.');
  if (!encoded || !signature) return false;

  const expectedSignature = sign(encoded);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminSessionPayload;
    return payload.admin === true && payload.exp >= Date.now();
  } catch {
    return false;
  }
}

/** Comparação em tempo constante da senha do admin contra ADMIN_PASSWORD. */
export function isAdminPasswordCorrect(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(password);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export const adminSessionCookieName = ADMIN_SESSION_COOKIE_NAME;
export const adminSessionMaxAgeSeconds = ADMIN_SESSION_TTL_SECONDS;
