import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  listUsersPendingOnboardingNudge: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const core = vi.hoisted(() => ({ sendWhatsappTextMessage: vi.fn(), hour: 14 }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zapbuddy/core')>()),
  sendWhatsappTextMessage: core.sendWhatsappTextMessage,
  getLocalHour: () => core.hour,
}));

import { handleOnboardingNudge } from './onboarding-nudge.js';

const user = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  whatsapp_number: `55119${id}`,
  timezone: 'America/Sao_Paulo',
  quiet_hours_start: 22,
  quiet_hours_end: 7,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  core.hour = 14;
  core.sendWhatsappTextMessage.mockResolvedValue(undefined);
  db.listUsersPendingOnboardingNudge.mockResolvedValue([]);
});

describe('handleOnboardingNudge', () => {
  it('2º estágio fica DENTRO da janela de 24h da Meta (20h–21h): em 24h–25h a Cloud API recusa texto livre e ninguém era reengajado', async () => {
    await handleOnboardingNudge();

    const windows = db.listUsersPendingOnboardingNudge.mock.calls.map((call) => [call[0], call[1]]);
    expect(windows).toEqual([
      [2, 3],
      [20, 21],
    ]);
    for (const [from, to] of windows) {
      expect(to as number).toBeLessThan(24); // nunca mais depois das 24h da última mensagem da pessoa
      expect(from as number).toBeLessThan(to as number);
    }
  });

  it('manda a cada pessoa da janela, em cada estágio', async () => {
    db.listUsersPendingOnboardingNudge.mockResolvedValueOnce([user('1'), user('2')]).mockResolvedValueOnce([user('3')]);
    await handleOnboardingNudge();
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledTimes(3);
    expect(core.sendWhatsappTextMessage.mock.calls.map((c) => c[0])).toEqual(['551191', '551192', '551193']);
  });

  it('respeita o horário de silêncio no fuso da pessoa: de madrugada não manda (antes mandava)', async () => {
    core.hour = 1; // dentro do silêncio 22–7
    db.listUsersPendingOnboardingNudge.mockResolvedValueOnce([user('1')]);
    await handleOnboardingNudge();
    expect(core.sendWhatsappTextMessage).not.toHaveBeenCalled();
    expect(db.logger.info).toHaveBeenCalledWith('onboarding_nudge_skipped_quiet_hours', expect.objectContaining({ userId: '1', stage: '2h' }));
  });

  it('o silêncio é de CADA pessoa: uma dentro e outra fora do horário', async () => {
    db.listUsersPendingOnboardingNudge.mockResolvedValueOnce([user('1', { quiet_hours_start: 13, quiet_hours_end: 16 }), user('2')]);
    await handleOnboardingNudge();
    expect(core.sendWhatsappTextMessage.mock.calls.map((c) => c[0])).toEqual(['551192']); // 14h está no silêncio da 1ª
  });

  it('falha de envio de uma pessoa não impede as outras e fica no log', async () => {
    db.listUsersPendingOnboardingNudge.mockResolvedValueOnce([user('1'), user('2')]);
    core.sendWhatsappTextMessage.mockRejectedValueOnce(new Error('janela fechada')).mockResolvedValue(undefined);
    await handleOnboardingNudge();
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledTimes(2);
    expect(db.logger.error).toHaveBeenCalledWith('onboarding_nudge_send_failed', expect.objectContaining({ userId: '1' }));
  });
});
