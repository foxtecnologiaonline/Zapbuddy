import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { clearMarketRateCache, fetchMarketRate, parseBcbDate, pickLatestRate } from './bcb.js';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  clearMarketRateCache();
  vi.useRealTimers();
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

describe('fetchMarketRate — cache compartilhado entre usuários', () => {
  const ok = (value: string) => ({ ok: true, json: async () => [{ data: '22/10/2026', valor: value }] });
  const mockFetch = (impl: () => unknown) => {
    const fn = vi.fn(impl);
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  it('a mesma série no mesmo dia é buscada uma vez só, não uma por usuário', async () => {
    const fetchMock = mockFetch(async () => ok('5.0383'));
    const first = await fetchMarketRate('usd', '2026-10-23');
    const second = await fetchMarketRate('usd', '2026-10-23');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('pedidos simultâneos (concorrência do worker) dividem a mesma requisição em voo', async () => {
    const fetchMock = mockFetch(async () => ok('5.0383'));
    const results = await Promise.all(Array.from({ length: 5 }, () => fetchMarketRate('selic', '2026-10-23')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((rate) => rate?.value)).size).toBe(1);
  });

  it('indicadores diferentes e dias diferentes são buscas diferentes', async () => {
    const fetchMock = mockFetch(async () => ok('5.0383'));
    await fetchMarketRate('usd', '2026-10-23');
    await fetchMarketRate('eur', '2026-10-23');
    await fetchMarketRate('usd', '2026-10-24');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('o cache expira: o câmbio publicado à tarde não fica preso ao valor da manhã', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch(async () => ok('5.0383'));
    await fetchMarketRate('usd', '2026-10-23');
    vi.advanceTimersByTime(29 * 60_000);
    await fetchMarketRate('usd', '2026-10-23');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * 60_000);
    await fetchMarketRate('usd', '2026-10-23');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falha também é guardada, mas só por poucos minutos (a queda do BC não gera uma rajada por usuário)', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch(async () => ({ ok: false, status: 404, json: async () => [] }));
    expect(await fetchMarketRate('cdi', '2026-10-23')).toBeNull();
    expect(await fetchMarketRate('cdi', '2026-10-23')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6 * 60_000);
    fetchMock.mockImplementation(async () => ok('10.65'));
    expect(await fetchMarketRate('cdi', '2026-10-23')).toMatchObject({ value: 10.65 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
