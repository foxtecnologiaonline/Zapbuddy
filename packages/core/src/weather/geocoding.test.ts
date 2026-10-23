import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { geocodeBrazilianCity, stateToUf } from './geocoding.js';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.OPENWEATHERMAP_API_KEY = 'test-key';
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

function stub(results: unknown) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => results }) as unknown as typeof fetch;
}

describe('stateToUf', () => {
  it('nome com ou sem acento, prefixo em inglês e sigla', () => {
    expect(stateToUf('Minas Gerais')).toBe('MG');
    expect(stateToUf('São Paulo')).toBe('SP');
    expect(stateToUf('State of Ceará')).toBe('CE');
    expect(stateToUf('pa')).toBe('PA');
    expect(stateToUf('Atlantis')).toBeNull();
    expect(stateToUf(undefined)).toBeNull();
  });
});

describe('geocodeBrazilianCity', () => {
  it('devolve coordenadas e UF do primeiro resultado brasileiro', async () => {
    stub([
      { name: 'Uberlândia', lat: -18.9, lon: -48.27, country: 'BR', state: 'Minas Gerais' },
      { name: 'Uberlândia', lat: 1, lon: 1, country: 'PT', state: 'Porto' },
    ]);
    expect(await geocodeBrazilianCity('Uberlândia')).toEqual({ city: 'Uberlândia', uf: 'MG', latitude: -18.9, longitude: -48.27 });
  });

  it('usa a UF pra desempatar cidades homônimas', async () => {
    stub([
      { name: 'Santa Luzia', lat: -19.77, lon: -43.85, country: 'BR', state: 'Minas Gerais' },
      { name: 'Santa Luzia', lat: -6.87, lon: -36.92, country: 'BR', state: 'Paraíba' },
    ]);
    expect(await geocodeBrazilianCity('Santa Luzia', 'pb')).toMatchObject({ uf: 'PB', latitude: -6.87 });
  });

  it('null quando não acha, UF não bate, sem chave ou API falha', async () => {
    stub([]);
    expect(await geocodeBrazilianCity('Nárnia')).toBeNull();

    stub([{ name: 'Santa Luzia', lat: 1, lon: 1, country: 'BR', state: 'Minas Gerais' }]);
    expect(await geocodeBrazilianCity('Santa Luzia', 'PB')).toBeNull();

    delete process.env.OPENWEATHERMAP_API_KEY;
    expect(await geocodeBrazilianCity('Uberlândia')).toBeNull();

    process.env.OPENWEATHERMAP_API_KEY = 'k';
    global.fetch = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    expect(await geocodeBrazilianCity('Uberlândia')).toBeNull();
  });
});
