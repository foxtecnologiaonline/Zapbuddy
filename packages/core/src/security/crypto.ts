import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recomendado pro GCM — não reusar o padrão CBC de 16

function getKey(): Buffer {
  const base64Key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!base64Key) throw new Error('TOKEN_ENCRYPTION_KEY must be set');
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY deve decodificar para 32 bytes (AES-256) — gere com `openssl rand -base64 32`');
  }
  return key;
}

/**
 * Criptografa um segredo (ex.: refresh token do Google) antes de persistir.
 * Formato: `${iv}:${authTag}:${ciphertext}`, tudo em base64 — autossuficiente
 * pra decrypt() sem precisar de uma coluna separada pro IV/tag.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Formato inválido de segredo criptografado');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}
