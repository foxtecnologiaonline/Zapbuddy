import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

/**
 * Proteção contra SSRF para URLs fornecidas por usuário (webhooks de saída).
 * Sem isso, qualquer pessoa logada podia cadastrar `https://169.254.169.254/...`
 * ou um host interno e fazer o worker bater em rede privada/metadata de cloud.
 *
 * Duas camadas, e a segunda é a que importa contra um atacante com DNS próprio:
 * 1. `isSafeWebhookUrlSyntax` — barra o óbvio já no cadastro (feedback imediato).
 * 2. `publicOnlyLookup` — passado como `lookup` da conexão HTTPS, valida o IP **no
 *    instante em que o socket é aberto** e conecta justamente naquele IP. Resolver o
 *    DNS numa checagem e deixar o `fetch` resolver de novo depois abre uma janela de
 *    DNS rebinding (TTL 0: 1ª resposta pública, 2ª `127.0.0.1`); aqui não há 2ª resolução.
 */

/**
 * Faixas que nunca são destino legítimo de webhook. Lista por faixa (CIDR) em vez de
 * prefixo de texto: prefixo de string deixava passar NAT64, 6to4, IPv4-compatível,
 * site-local e traduzido (SIIT), que embutem um IPv4 interno dentro de um IPv6.
 */
const BLOCKED = new BlockList();

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "esta rede"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (inclui metadata de cloud 169.254.169.254)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentação (TEST-NET-1)
  ['192.88.99.0', 24], // 6to4 relay (obsoleto)
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmark
  ['198.51.100.0', 24], // documentação (TEST-NET-2)
  ['203.0.113.0', 24], // documentação (TEST-NET-3)
  ['224.0.0.0', 3], // multicast + reservado (224.0.0.0 – 255.255.255.255)
];

const BLOCKED_V6: Array<[string, number]> = [
  ['::', 96], // :: , ::1 (loopback) e IPv4-compatível ::a.b.c.d (obsoleto)
  ['::ffff:0:0:0', 96], // IPv4 traduzido (SIIT)
  ['64:ff9b::', 96], // NAT64 (embute IPv4 nos 32 bits finais)
  ['64:ff9b:1::', 48], // NAT64 local-use
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo (embute IPv4)
  ['2001:db8::', 32], // documentação
  ['2002::', 16], // 6to4 (embute IPv4)
  ['fc00::', 7], // ULA (privada)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (obsoleto)
  ['ff00::', 8], // multicast
];

for (const [network, prefix] of BLOCKED_V4) BLOCKED.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of BLOCKED_V6) BLOCKED.addSubnet(network, prefix, 'ipv6');

/** IPv4 mapeado em IPv6 (`::ffff:a.b.c.d` ou `::ffff:abcd:efgh`) → o IPv4 de dentro; senão null. */
function mappedIpv4(ipv6: string): string | null {
  const dotted = ipv6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dotted) return dotted[1]!;
  const hex = ipv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** Endereço que não pode receber webhook. Entrada que não é IP válido conta como proibida (fail closed). */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.split('%')[0]!; // zone id (fe80::1%eth0) não faz parte do endereço
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) {
    const mapped = mappedIpv4(address);
    if (mapped !== null) return BLOCKED.check(mapped, 'ipv4');
    return BLOCKED.check(address, 'ipv6');
  }
  return true;
}

/** Hostname sem colchetes de IPv6 e sem ponto final (`localhost.` é o mesmo host que `localhost`). */
function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.+$/, '');
}

/** Validação síncrona do formato (usada no cadastro): só https, sem credencial embutida, sem host interno óbvio. */
export function isSafeWebhookUrlSyntax(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || raw.length > 2048) return false;
  const host = normalizeHost(url.hostname);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  return host.includes('.');
}

/** Erro lançado quando o DNS resolve para endereço interno; `code` evita retentar algo que nunca vai passar. */
export const SSRF_BLOCKED_CODE = 'ERR_SSRF_BLOCKED';

/**
 * `lookup` para `https.request`: resolve o nome, recusa se QUALQUER resposta for privada e devolve
 * só endereços já validados — o socket conecta exatamente neles (sem 2ª resolução de DNS).
 * Host que já é IP literal nem chega aqui: o Node não chama `lookup` pra IP (a checagem de sintaxe cobre).
 */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 4);
      return;
    }
    const list = addresses as unknown as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      callback(Object.assign(new Error('URL de webhook resolve para endereço interno'), { code: SSRF_BLOCKED_CODE }), '', 4);
      return;
    }
    if (options.all) {
      (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, list);
      return;
    }
    callback(null, list[0]!.address, list[0]!.family);
  });
};
