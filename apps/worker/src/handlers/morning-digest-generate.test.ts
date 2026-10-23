import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

vi.mock('@zapbuddy/db', () => ({
  inferLocationFromWhatsappNumber: vi.fn(() => ({ city: 'São Paulo', uf: 'SP', latitude: -23.55, longitude: -46.63 })),
  listActiveRecurringBills: vi.fn(),
  listPendingTasksDueBetween: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@zapbuddy/core', async () => {
  // A composição é lógica pura e já tem teste próprio — aqui entra a real; só o IO é falso.
  const actual = await vi.importActual<typeof import('@zapbuddy/core')>('../../../../packages/core/src/index.ts');
  return {
    ...actual,
    getTodayWeatherSummary: vi.fn(),
    getTodayAgendaEvents: vi.fn(),
    sendWhatsappTextMessage: vi.fn(),
  };
});

import { listActiveRecurringBills, listPendingTasksDueBetween, logger } from '@zapbuddy/db';
import { getTodayAgendaEvents, getTodayWeatherSummary, sendWhatsappTextMessage, type MorningDigestGenerateJob } from '@zapbuddy/core';
import { handleMorningDigestGenerate } from './morning-digest-generate.js';

function job(data: Partial<MorningDigestGenerateJob> = {}): Job<MorningDigestGenerateJob> {
  return {
    data: {
      accountId: 'acc-1',
      ownerWhatsappNumber: '5511999999999',
      ownerTimezone: 'America/Sao_Paulo',
      displayName: 'Ana',
      digestHour: 8,
      ...data,
    },
  } as Job<MorningDigestGenerateJob>;
}

async function run(data?: Partial<MorningDigestGenerateJob>): Promise<void> {
  const promise = handleMorningDigestGenerate(job(data));
  await vi.runAllTimersAsync();
  await promise;
}

const sent = () => vi.mocked(sendWhatsappTextMessage).mock.calls.map((call) => call[1]);

beforeEach(() => {
  vi.useFakeTimers();
  // 2026-10-22 08:00 em São Paulo; a conta recorrente "Aluguel" vence dia 22.
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 11, 0, 0)));
  vi.mocked(getTodayWeatherSummary).mockReset().mockResolvedValue(null);
  vi.mocked(getTodayAgendaEvents).mockReset().mockResolvedValue([]);
  vi.mocked(listPendingTasksDueBetween).mockReset().mockResolvedValue([]);
  vi.mocked(listActiveRecurringBills).mockReset().mockResolvedValue([]);
  vi.mocked(sendWhatsappTextMessage).mockReset().mockResolvedValue(undefined);
  vi.mocked(logger.error).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handleMorningDigestGenerate', () => {
  it('sem nada: só a narrativa, com o nome e sem afirmar mentira', async () => {
    await run();

    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toContain('*Bom dia, Ana!*');
    expect(sent()[0]).toMatch(/nada registrado|dia está livre/);
  });

  it('agenda, tarefa e conta: 3 mensagens na ordem narrativa → agenda → financeiro', async () => {
    vi.mocked(getTodayAgendaEvents).mockResolvedValue([
      { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' },
      { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' },
    ]);
    vi.mocked(listPendingTasksDueBetween).mockResolvedValue([{ title: 'Pagar IPTU', due_at: '2026-10-23T02:59:59.000Z' }] as never);
    vi.mocked(listActiveRecurringBills).mockResolvedValue([{ name: 'Aluguel', amount_cents: 120000, due_day: 22 }] as never);

    await run();

    expect(sent()).toHaveLength(3);
    expect(sent()[1]).toContain('Dentista');
    expect(sent()[1]).toContain('Pagar IPTU');
    expect(sent()[2]).toContain('Aluguel');
  });

  it('seções desligadas nem são buscadas', async () => {
    await run({ includeAgenda: false, includeFinance: false });

    expect(getTodayAgendaEvents).not.toHaveBeenCalled();
    expect(listPendingTasksDueBetween).not.toHaveBeenCalled();
    expect(listActiveRecurringBills).not.toHaveBeenCalled();
  });

  it('usa a cidade informada (coordenadas) no lugar da aproximação por DDD', async () => {
    await run({ city: { uf: 'MG', latitude: -18.9, longitude: -48.27 } });

    expect(getTodayWeatherSummary).toHaveBeenCalledWith({ latitude: -18.9, longitude: -48.27, timezone: 'America/Sao_Paulo' });
  });

  it('agenda fora do ar: manda o resto e NÃO diz que o dia está livre', async () => {
    vi.mocked(getTodayAgendaEvents).mockRejectedValue(new Error('google 503'));

    await run();

    expect(sent()).toHaveLength(1);
    expect(sent()[0]).not.toMatch(/nada registrado|dia está livre/);
    expect(logger.error).toHaveBeenCalledWith('morning_digest_source_failed', expect.objectContaining({ source: 'agenda' }));
  });

  it('clima fora do ar não atrapalha: o dia livre continua valendo', async () => {
    vi.mocked(getTodayWeatherSummary).mockRejectedValue(new Error('timeout'));

    await run();

    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatch(/nada registrado|dia está livre/);
  });

  it('falha no envio da 2ª mensagem não propaga (evita reenviar a narrativa num retry) e a 3ª ainda é tentada', async () => {
    vi.mocked(getTodayAgendaEvents).mockResolvedValue([
      { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' },
      { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' },
    ]);
    vi.mocked(listActiveRecurringBills).mockResolvedValue([{ name: 'Aluguel', amount_cents: 120000, due_day: 22 }] as never);
    vi.mocked(sendWhatsappTextMessage).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('whatsapp 500')).mockResolvedValue(undefined);

    await expect(run()).resolves.toBeUndefined();

    expect(sent()).toHaveLength(3);
    expect(logger.error).toHaveBeenCalledWith('morning_digest_message_failed', expect.objectContaining({ accountId: 'acc-1' }));
  });

  it('falha no envio da narrativa propaga (nada foi entregue, retry é seguro)', async () => {
    vi.mocked(sendWhatsappTextMessage).mockRejectedValue(new Error('whatsapp down'));

    const promise = handleMorningDigestGenerate(job());
    const assertion = expect(promise).rejects.toThrow('whatsapp down');
    await vi.runAllTimersAsync();
    await assertion;
  });
});
