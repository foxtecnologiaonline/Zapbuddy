import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from './crypto.js';

const KEY = randomBytes(32).toString('base64');
const original = process.env.TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (original === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = original;
});

describe('crypto — refresh token da agenda em repouso', () => {
  it('cifra e decifra de volta, inclusive texto com acento e emoji', () => {
    for (const secret of ['1//0gAbC-refresh_token', 'tökén-çom-acento-😀', 'x'.repeat(2000)]) {
      expect(decryptSecret(encryptSecret(secret))).toBe(secret);
    }
  });

  it('o texto cifrado não contém o segredo em claro, e o IV é novo a cada vez (mesmo segredo, saídas diferentes)', () => {
    const a = encryptSecret('segredo-que-nao-pode-vazar');
    const b = encryptSecret('segredo-que-nao-pode-vazar');
    expect(a).not.toContain('segredo');
    expect(a).not.toBe(b);
    expect(a.split(':')).toHaveLength(3);
  });

  it('adulterar o texto cifrado (ou a etiqueta de autenticação) falha: GCM autentica, não só cifra', () => {
    const [iv, tag, data] = encryptSecret('refresh-token').split(':') as [string, string, string];
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join(':'))).toThrow();

    const badTag = Buffer.from(tag, 'base64');
    badTag[0] = (badTag[0] ?? 0) ^ 1;
    expect(() => decryptSecret([iv, badTag.toString('base64'), data].join(':'))).toThrow();
  });

  it('formato inválido e chave errada falham com clareza', () => {
    expect(() => decryptSecret('so-um-pedaco')).toThrow(/Formato inválido/);
    const stored = encryptSecret('refresh-token');
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64'); // outra chave
    expect(() => decryptSecret(stored)).toThrow();
  });

  it('chave ausente ou do tamanho errado é recusada (nunca cifra com chave fraca)', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/TOKEN_ENCRYPTION_KEY must be set/);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
  });
});
