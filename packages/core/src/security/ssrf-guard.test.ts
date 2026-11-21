import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:dns')>()), lookup: vi.fn() }));

import { lookup as dnsLookup } from 'node:dns';
import { SSRF_BLOCKED_CODE, isPrivateAddress, isSafeWebhookUrlSyntax, publicOnlyLookup } from './ssrf-guard.js';

describe('isSafeWebhookUrlSyntax', () => {
  it.each([
    'http://example.com/hook',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://[::1]/x',
    'https://[::ffff:10.0.0.1]/x',
    'https://user:pass@example.com/x',
    'https://intranet/x',
    'https://db.internal/x',
    'not a url',
  ])('rejeita %s', (url) => {
    expect(isSafeWebhookUrlSyntax(url)).toBe(false);
  });

  // Vetores que a 1ª versão (lista de prefixos de texto) deixava passar.
  it.each([
    ['ponto final no host', 'https://localhost./x'],
    ['ponto final em subdomínio local', 'https://api.localhost./x'],
    ['NAT64 com 127.0.0.1', 'https://[64:ff9b::7f00:1]/x'],
    ['NAT64 com metadata de cloud', 'https://[64:ff9b::a9fe:a9fe]/x'],
    ['6to4 com 127.0.0.1', 'https://[2002:7f00:1::]/x'],
    ['IPv4-compatível com 127.0.0.1', 'https://[::127.0.0.1]/x'],
    ['IPv4-compatível com 10.0.0.1', 'https://[::a00:1]/x'],
    ['site-local', 'https://[fec0::1]/x'],
    ['IPv4 traduzido (SIIT)', 'https://[::ffff:0:7f00:1]/x'],
    ['mapeado, forma expandida', 'https://[0:0:0:0:0:ffff:7f00:1]/x'],
    ['Teredo', 'https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/x'],
    ['IPv4 em decimal', 'https://2130706433/x'],
    ['IPv4 em hexadecimal', 'https://0x7f.0.0.1/x'],
    ['IPv4 em octal', 'https://017700000001/x'],
    ['CGNAT', 'https://100.64.0.1/x'],
    ['multicast', 'https://224.0.0.1/x'],
    ['broadcast', 'https://255.255.255.255/x'],
    ['unspecified', 'https://0.0.0.0/x'],
    ['ULA', 'https://[fd00::1]/x'],
    ['link-local IPv6', 'https://[fe80::1]/x'],
  ])('rejeita %s', (_label, url) => {
    expect(isSafeWebhookUrlSyntax(url)).toBe(false);
  });

  it('aceita https público', () => {
    expect(isSafeWebhookUrlSyntax('https://hooks.example.com/zapbuddy')).toBe(true);
    expect(isSafeWebhookUrlSyntax('https://8.8.8.8/x')).toBe(true);
    expect(isSafeWebhookUrlSyntax('https://[2606:4700::1111]/x')).toBe(true);
  });
});

describe('isPrivateAddress', () => {
  it('classifica faixas privadas', () => {
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });

  it.each(['::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::', 'fec0::1', '::7f00:1', '::', '::1', 'fe80::1%eth0'])(
    'bloqueia %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    },
  );

  it.each(['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888', '2606:4700::1111', '::ffff:8.8.8.8'])('libera %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it('texto que não é IP conta como proibido (fail closed)', () => {
    expect(isPrivateAddress('example.com')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});

/** Faz o `dns.lookup` mockado responder como o DNS de um atacante responderia. */
function dnsAnswers(addresses: Array<{ address: string; family: 4 | 6 }>) {
  vi.mocked(dnsLookup).mockImplementation(((_host: string, _options: unknown, callback: (error: null, result: unknown) => void) => {
    callback(null, addresses);
  }) as never);
}

describe('publicOnlyLookup (validação do IP na conexão — anti DNS rebinding)', () => {
  beforeEach(() => {
    vi.mocked(dnsLookup).mockReset();
  });

  function resolve(options: { all?: boolean }): Promise<{ error: (Error & { code?: string }) | null; result: unknown; family?: number }> {
    return new Promise((done) => {
      publicOnlyLookup('hooks.example.com', options as never, ((error: Error | null, result: unknown, family?: number) =>
        done({ error, result, family })) as never);
    });
  }

  it('recusa nome que resolve pra endereço interno, com código próprio (não retentável)', async () => {
    dnsAnswers([{ address: '127.0.0.1', family: 4 }]);
    const { error } = await resolve({ all: true });
    expect(error?.code).toBe(SSRF_BLOCKED_CODE);
  });

  it('recusa se QUALQUER resposta for interna, mesmo com outra pública junto', async () => {
    dnsAnswers([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);
    expect((await resolve({ all: true })).error?.code).toBe(SSRF_BLOCKED_CODE);
  });

  it('recusa resposta IPv6 que embute IPv4 interno (NAT64)', async () => {
    dnsAnswers([{ address: '64:ff9b::7f00:1', family: 6 }]);
    expect((await resolve({ all: true })).error?.code).toBe(SSRF_BLOCKED_CODE);
  });

  it('recusa resposta vazia', async () => {
    dnsAnswers([]);
    expect((await resolve({ all: true })).error?.code).toBe(SSRF_BLOCKED_CODE);
  });

  it('devolve só endereços já validados, no formato que o socket espera (all: true → lista)', async () => {
    dnsAnswers([{ address: '93.184.216.34', family: 4 }]);
    const { error, result } = await resolve({ all: true });
    expect(error).toBeNull();
    expect(result).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('sem all: devolve o primeiro endereço e a família', async () => {
    dnsAnswers([{ address: '2606:4700::1111', family: 6 }]);
    const { error, result, family } = await resolve({});
    expect(error).toBeNull();
    expect(result).toBe('2606:4700::1111');
    expect(family).toBe(6);
  });

  it('propaga erro de DNS sem tratá-lo como bloqueio', async () => {
    vi.mocked(dnsLookup).mockImplementation(((_h: string, _o: unknown, callback: (error: Error) => void) => {
      callback(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    }) as never);
    const { error } = await resolve({ all: true });
    expect(error?.code).toBe('ENOTFOUND');
  });
});
