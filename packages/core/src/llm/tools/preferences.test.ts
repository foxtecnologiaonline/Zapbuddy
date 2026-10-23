import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({
  findUserById: vi.fn(),
  saveMorningDigestPreferences: vi.fn(),
  saveUserCity: vi.fn(),
  saveUserEmail: vi.fn(),
  setOccupation: vi.fn(),
  setQuietHours: vi.fn(),
}));
vi.mock('../../weather/geocoding.js', () => ({ geocodeBrazilianCity: vi.fn() }));

import { findUserById, saveMorningDigestPreferences, saveUserCity } from '@zapbuddy/db';
import { geocodeBrazilianCity } from '../../weather/geocoding.js';
import { setCityTool, setMorningDigestPreferencesTool } from './preferences.js';

const ctx = { userId: 'u1', whatsappNumber: '5511999999999', messageSource: 'text', timezone: 'America/Sao_Paulo', accountId: 'a1', role: 'owner', turnId: 'turn-test' } as const;

beforeEach(() => {
  vi.mocked(findUserById).mockReset().mockResolvedValue({ quiet_hours_start: 22, quiet_hours_end: 7 } as never);
  vi.mocked(saveMorningDigestPreferences).mockReset();
  vi.mocked(saveUserCity).mockReset();
  vi.mocked(geocodeBrazilianCity).mockReset();
});

describe('set_morning_digest_preferences', () => {
  it('grava só o que foi pedido e devolve o estado final', async () => {
    vi.mocked(saveMorningDigestPreferences).mockResolvedValue({
      morning_digest_enabled: true,
      morning_digest_hour: 7,
      morning_digest_agenda: true,
      morning_digest_finance: false,
    } as never);

    const result = await setMorningDigestPreferencesTool.execute({ hour: 7, include_finance: false }, ctx);

    expect(saveMorningDigestPreferences).toHaveBeenCalledWith('u1', { enabled: undefined, hour: 7, includeAgenda: undefined, includeFinance: false });
    expect(result).toEqual({ saved: true, enabled: true, hour: 7, include_agenda: true, include_finance: false });
  });

  it('sem nenhum campo, não grava (update vazio)', async () => {
    expect(await setMorningDigestPreferencesTool.execute({}, ctx)).toEqual({ saved: false, reason: 'nothing_to_change' });
    expect(saveMorningDigestPreferences).not.toHaveBeenCalled();
  });

  it('recusa horário dentro do silêncio (a mensagem nunca sairia)', async () => {
    const result = await setMorningDigestPreferencesTool.execute({ hour: 23 }, ctx);

    expect(result).toEqual({ saved: false, reason: 'inside_quiet_hours', quiet_hours_start: 22, quiet_hours_end: 7 });
    expect(saveMorningDigestPreferences).not.toHaveBeenCalled();
  });
});

describe('set_city', () => {
  it('geocodifica e grava cidade, UF e coordenadas', async () => {
    vi.mocked(geocodeBrazilianCity).mockResolvedValue({ city: 'Uberlândia', uf: 'MG', latitude: -18.9, longitude: -48.27 });

    const result = await setCityTool.execute({ city: 'Uberlândia' }, ctx);

    expect(saveUserCity).toHaveBeenCalledWith('u1', { city: 'Uberlândia', uf: 'MG', latitude: -18.9, longitude: -48.27 });
    expect(result).toEqual({ saved: true, city: 'Uberlândia', uf: 'MG' });
  });

  it('não grava quando não localiza', async () => {
    vi.mocked(geocodeBrazilianCity).mockResolvedValue(null);

    expect(await setCityTool.execute({ city: 'Nárnia' }, ctx)).toEqual({ saved: false });
    expect(saveUserCity).not.toHaveBeenCalled();
  });
});
