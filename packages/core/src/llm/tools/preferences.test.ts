import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({
  findUserById: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  saveProactiveOptOut: vi.fn(),
  saveRoutinePrefs: vi.fn(),
  saveMorningDigestPreferences: vi.fn(),
  saveUserCity: vi.fn(),
  saveUserEmail: vi.fn(),
  setOccupation: vi.fn(),
  setQuietHours: vi.fn(),
}));
vi.mock('../../weather/geocoding.js', () => ({ geocodeBrazilianCity: vi.fn() }));

import { findUserById, saveMorningDigestPreferences, saveProactiveOptOut, saveRoutinePrefs, saveUserCity } from '@zapbuddy/db';
import { geocodeBrazilianCity } from '../../weather/geocoding.js';
import { setCityTool, setMorningDigestPreferencesTool } from './preferences.js';

const ctx = { userId: 'u1', whatsappNumber: '5511999999999', messageSource: 'text', timezone: 'America/Sao_Paulo', accountId: 'a1', role: 'owner' } as const;

beforeEach(() => {
  vi.mocked(findUserById).mockReset().mockResolvedValue({ quiet_hours_start: 22, quiet_hours_end: 7 } as never);
  vi.mocked(saveMorningDigestPreferences).mockReset();
  vi.mocked(saveProactiveOptOut).mockReset().mockResolvedValue(undefined);
  vi.mocked(saveRoutinePrefs).mockReset();
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

    expect(saveMorningDigestPreferences).toHaveBeenCalledWith('u1', { enabled: undefined, hour: 7, includeAgenda: undefined, includeFinance: false, indicators: undefined });
    expect(result).toEqual({ saved: true, enabled: true, hour: 7, include_agenda: true, include_finance: false, indicators: [] });
  });

  it('indicadores econômicos: normaliza (sem lixo/repetição, na ordem de exibição) e devolve o estado', async () => {
    vi.mocked(saveMorningDigestPreferences).mockResolvedValue({
      morning_digest_enabled: true,
      morning_digest_hour: 8,
      morning_digest_agenda: true,
      morning_digest_finance: true,
      morning_digest_indicators: ['usd', 'selic'],
    } as never);

    const result = await setMorningDigestPreferencesTool.execute({ indicators: ['selic', 'usd', 'selic'] }, ctx);

    expect(saveMorningDigestPreferences).toHaveBeenCalledWith('u1', expect.objectContaining({ indicators: ['usd', 'selic'] }));
    expect(result).toMatchObject({ saved: true, indicators: ['usd', 'selic'] });
  });

  it('indicators vazio remove todos (e conta como mudança)', async () => {
    vi.mocked(saveMorningDigestPreferences).mockResolvedValue({ morning_digest_indicators: [] } as never);
    await setMorningDigestPreferencesTool.execute({ indicators: [] }, ctx);
    expect(saveMorningDigestPreferences).toHaveBeenCalledWith('u1', expect.objectContaining({ indicators: [] }));
  });

  it('código inexistente é recusado pelo schema', () => {
    expect(setMorningDigestPreferencesTool.schema.safeParse({ indicators: ['bitcoin'] }).success).toBe(false);
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

describe('set_morning_digest_preferences — insight das 19h e resumo semanal (migration 0031)', () => {
  it('desligar os dois grava as colunas certas e confirma', async () => {
    const result = await setMorningDigestPreferencesTool.execute({ insights: false, weekly_digest: false }, ctx);
    expect(saveProactiveOptOut).toHaveBeenCalledWith('u1', { routine_insights: false, routine_weekly_digest: false });
    expect(result).toEqual({ saved: true, insights_weekly_saved: true });
  });

  it('"parar tudo": rotinas + insight + semanal no mesmo pedido', async () => {
    vi.mocked(saveRoutinePrefs).mockResolvedValue({ routine_checkins: false } as never);
    const result = (await setMorningDigestPreferencesTool.execute({ checkins: false, weekly_tip: false, insights: false, weekly_digest: false }, ctx)) as Record<string, unknown>;
    expect(saveRoutinePrefs).toHaveBeenCalledWith('u1', { routine_checkins: false, routine_weekly_tip: false });
    expect(saveProactiveOptOut).toHaveBeenCalled();
    expect(result.saved).toBe(true);
  });

  it('migration 0031 não aplicada: devolve not_saved (o Tom diz que não conseguiu) em vez de confirmar um "desliguei" que não aconteceu', async () => {
    vi.mocked(saveProactiveOptOut).mockRejectedValue(new Error('column "routine_insights" does not exist'));
    const result = await setMorningDigestPreferencesTool.execute({ insights: false }, ctx);
    expect(result).toEqual({ saved: false, not_saved: ['insights'] });
  });

  it('as outras preferências do mesmo pedido são gravadas mesmo quando o insight não dá', async () => {
    vi.mocked(saveProactiveOptOut).mockRejectedValue(new Error('coluna ausente'));
    vi.mocked(saveMorningDigestPreferences).mockResolvedValue({ morning_digest_enabled: false, morning_digest_hour: 8, morning_digest_agenda: true, morning_digest_finance: true } as never);
    const result = (await setMorningDigestPreferencesTool.execute({ enabled: false, insights: false, weekly_digest: false }, ctx)) as Record<string, unknown>;
    expect(saveMorningDigestPreferences).toHaveBeenCalled();
    expect(result.not_saved).toEqual(['insights', 'weekly_digest']);
    expect(result.saved).toBe(false);
    expect(result.enabled).toBe(false);
  });

  it('nada pedido continua "nothing_to_change"', async () => {
    expect(await setMorningDigestPreferencesTool.execute({}, ctx)).toEqual({ saved: false, reason: 'nothing_to_change' });
    expect(saveProactiveOptOut).not.toHaveBeenCalled();
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
