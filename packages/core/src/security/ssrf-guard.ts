import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Proteção contra SSRF para URLs fornecidas por usuário (webhooks de saída).
 * Sem isso, qualquer pessoa logada podia cadastrar `https://169.254.169.254/...`
 * ou um host interno e fazer o worker bater em rede privada/metadata de cloud.
 */

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  // new URL() normaliza ::ffff:10.0.0.1 para ::ffff:a00:1 — também é IPv4 embutido.
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
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
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  return host.includes('.');
}

/** Validação completa na hora de entregar: resolve o DNS e recusa se QUALQUER endereço for privado (anti DNS-rebinding de cadastro). */
export async function assertPublicHttpsUrl(raw: string): Promise<void> {
  if (!isSafeWebhookUrlSyntax(raw)) throw new Error('URL de webhook não permitida');
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return;
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('URL de webhook resolve para endereço interno');
  }
}
