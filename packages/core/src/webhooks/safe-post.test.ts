import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:dns')>()), lookup: vi.fn() }));

import { lookup as dnsLookup } from 'node:dns';
import { SSRF_BLOCKED_CODE } from '../security/ssrf-guard.js';
import { postJsonToPublicHttps } from './safe-post.js';

const HEADERS = { 'Content-Type': 'application/json' };

describe('postJsonToPublicHttps', () => {
  beforeEach(() => {
    vi.mocked(dnsLookup).mockReset();
  });

  it('recusa URL que falha na validação de formato, sem nem resolver DNS', async () => {
    for (const url of ['http://example.com/x', 'https://127.0.0.1/x', 'https://[64:ff9b::7f00:1]/x', 'https://localhost./x']) {
      await expect(postJsonToPublicHttps(url, '{}', HEADERS, 1_000, 0)).rejects.toThrow('URL de webhook não permitida');
    }
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('DNS rebinding: nome que resolve pra IP interno no momento da conexão é recusado, sem retry', async () => {
    // O nome passa na checagem de formato (parece público); só a resolução na conexão revela o IP interno.
    vi.mocked(dnsLookup).mockImplementation(((_host: string, _options: unknown, callback: (error: null, result: unknown) => void) => {
      callback(null, [{ address: '169.254.169.254', family: 4 }]);
    }) as never);

    await expect(postJsonToPublicHttps('https://rebind.example.com/hook', '{}', HEADERS, 2_000, 0)).rejects.toMatchObject({
      code: SSRF_BLOCKED_CODE,
    });
    // Falha de segurança nunca é retentada: uma única resolução.
    expect(dnsLookup).toHaveBeenCalledTimes(1);
  });
});
