import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { fetchMarketRate, parseBcbDate, pickLatestRate } from './bcb.js';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('parseBcbDate', () => {
  it('converte dd/mm/yyyy pra YYYY-MM-DD e rejeita lixo', () => {
    expect(parseBcbDate('22/10/2026')).toBe('2026-10-22');
    expect(parseBcbDate('2026-10-22')).toBeNull();
  });
});

describe('pickLatestRate', () => {
  it('ignora observação com data futura (início de vigência da Selic)', () => {
    const rows = [
      { data: '17/09/2026', valor: '13.75' },
      { data: '04/11/2026', valor: '13.25' },
    ];
    expect(pickLatestRate(rows, '2026-10-23')).toEqual({ referenceDate: '2026-09-17', value: 13.75 });
  });

  it('devolve null sem nenhuma observação válida', () => {
    expect(pickLatestRate([], '2026-10-23')).toBeNull();
    expect(pickLatestRate([{ data: '22/10/2026', valor: 'abc' }], '2026-10-23')).toBeNull();
  });
});

describe('fetchMarketRate', () => {
  it('monta o resultado com fonte e data de referência', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ data: '22/10/2026', valor: '5.0383' }] }) as unknown as typeof fetch;
    const rate = await fetchMarketRate('usd', '2026-10-23');
    expect(rate).toMatchObject({ indicator: 'usd', value: 5.0383, unit: 'R$', referenceDate: '2026-10-22', source: 'Banco Central do Brasil (SGS)' });
  });

  it('nunca lança: falha de rede vira null', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('rede')) as unknown as typeof fetch;
    expect(await fetchMarketRate('selic', '2026-10-23')).toBeNull();
  });
});
