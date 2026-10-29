import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

vi.mock('@zapbuddy/db', () => ({
  inferLocationFromWhatsappNumber: vi.fn(() => ({ city: 'São Paulo', uf: 'SP', latitude: -23.55, longitude: -46.63 })),
  listActiveRecurringBills: vi.fn(),
  listPendingTasksDueBetween: vi.fn(),
  listOverdueTasksAwaitingFollowUp: vi.fn(),
  markTaskFollowUpAsked: vi.fn(),
  listImportantDates: vi.fn(),
  hasSentImportantDateReminderThisYear: vi.fn(),
  logImportantDateReminder: vi.fn(),
  listActiveHabits: vi.fn(),
  listHabitCheckinDates: vi.fn(),
  listGoals: vi.fn(),
  listBudgets: vi.fn(),
  summarizeTransactions: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@zapbuddy/core', async () => {
  // A composição é lógica pura e já tem teste próprio — aqui entra a real; só o IO é falso.
  const actual = await vi.importActual<typeof import('@zapbuddy/core')>('../../../../packages/core/src/index.ts');
  return {
    ...actual,
    getTodayWeatherSummary: vi.fn(),
    getTodayAndTomorrowAgendaEvents: vi.fn(),
    sendWhatsappTextMessage: vi.fn(),
  };
});

import {
  hasSentImportantDateReminderThisYear,
  listActiveHabits,
  listActiveRecurringBills,
  listBudgets,
  listGoals,
  listHabitCheckinDates,
  listImportantDates,
  listOverdueTasksAwaitingFollowUp,
  listPendingTasksDueBetween,
  logImportantDateReminder,
  logger,
  summarizeTransactions,
} from '@zapbuddy/db';
import { getTodayAndTomorrowAgendaEvents, getTodayWeatherSummary, sendWhatsappTextMessage, type MorningDigestGenerateJob } from '@zapbuddy/core';
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
  vi.mocked(getTodayAndTomorrowAgendaEvents).mockReset().mockResolvedValue({ today: [], tomorrow: [] });
  vi.mocked(listPendingTasksDueBetween).mockReset().mockResolvedValue([]);
  vi.mocked(listActiveRecurringBills).mockReset().mockResolvedValue([]);
  vi.mocked(listOverdueTasksAwaitingFollowUp).mockReset().mockResolvedValue([]);
  vi.mocked(listImportantDates).mockReset().mockResolvedValue([]);
  vi.mocked(hasSentImportantDateReminderThisYear).mockReset().mockResolvedValue(false);
  vi.mocked(logImportantDateReminder).mockReset().mockResolvedValue(undefined);
  vi.mocked(listActiveHabits).mockReset().mockResolvedValue([]);
  vi.mocked(listHabitCheckinDates).mockReset().mockResolvedValue({});
  vi.mocked(listGoals).mockReset().mockResolvedValue([]);
  vi.mocked(listBudgets).mockReset().mockResolvedValue([]);
  vi.mocked(summarizeTransactions).mockReset().mockResolvedValue({ totalIncomeCents: 0, totalExpenseCents: 0, byCategory: {}, count: 0 });
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
    vi.mocked(getTodayAndTomorrowAgendaEvents).mockResolvedValue({ today: [
      { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' },
      { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' },
    ], tomorrow: [] });
    vi.mocked(listPendingTasksDueBetween).mockResolvedValue([{ title: 'Pagar IPTU', due_at: '2026-10-23T02:59:59+00:00' }] as never);
    vi.mocked(listActiveRecurringBills).mockResolvedValue([{ name: 'Aluguel', amount_cents: 120000, due_day: 22 }] as never);

    await run();

    expect(sent()).toHaveLength(3);
    expect(sent()[1]).toContain('Dentista');
    expect(sent()[1]).toContain('Pagar IPTU');
    expect(sent()[2]).toContain('Aluguel');
  });

  it('seções desligadas nem são buscadas', async () => {
    await run({ includeAgenda: false, includeFinance: false });

    expect(getTodayAndTomorrowAgendaEvents).not.toHaveBeenCalled();
    expect(listImportantDates).not.toHaveBeenCalled();
    expect(listActiveHabits).not.toHaveBeenCalled();
    expect(summarizeTransactions).not.toHaveBeenCalled();
    expect(listPendingTasksDueBetween).not.toHaveBeenCalled();
    expect(listActiveRecurringBills).not.toHaveBeenCalled();
  });

  it('usa a cidade informada (coordenadas) no lugar da aproximação por DDD', async () => {
    await run({ city: { uf: 'MG', latitude: -18.9, longitude: -48.27 } });

    expect(getTodayWeatherSummary).toHaveBeenCalledWith({ latitude: -18.9, longitude: -48.27, timezone: 'America/Sao_Paulo' });
  });

  it('agenda fora do ar: manda o resto e NÃO diz que o dia está livre', async () => {
    vi.mocked(getTodayAndTomorrowAgendaEvents).mockRejectedValue(new Error('google 503'));

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
    vi.mocked(getTodayAndTomorrowAgendaEvents).mockResolvedValue({ today: [
      { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' },
      { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' },
    ], tomorrow: [] });
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

  describe('mensagem de informações extras', () => {
    it('datas importantes de hoje e dos próximos dias, e o aviso das 9h não repete a de hoje', async () => {
      vi.mocked(listImportantDates).mockResolvedValue([
        { id: 'd1', label: 'aniversário da Ana', month: 10, day: 22 },
        { id: 'd2', label: 'aniversário de casamento', month: 10, day: 23 },
      ] as never);

      await run();

      expect(sent()).toHaveLength(2);
      expect(sent()[0]).toContain('separei umas informações') ;
      expect(sent()[1]).toContain('🗓️ Hoje: aniversário da Ana · Amanhã: aniversário de casamento');
      expect(logImportantDateReminder).toHaveBeenCalledWith('d1', 2026);
      expect(logImportantDateReminder).not.toHaveBeenCalledWith('d2', 2026);
    });

    it('data de hoje que já foi avisada não aparece de novo (e não é marcada outra vez)', async () => {
      vi.mocked(listImportantDates).mockResolvedValue([{ id: 'd1', label: 'aniversário da Ana', month: 10, day: 22 }] as never);
      vi.mocked(hasSentImportantDateReminderThisYear).mockResolvedValue(true);

      await run();

      expect(sent()).toHaveLength(1);
      expect(logImportantDateReminder).not.toHaveBeenCalled();
    });

    it('se a mensagem de extras falhar no envio, a data NÃO é marcada como avisada', async () => {
      vi.mocked(listImportantDates).mockResolvedValue([{ id: 'd1', label: 'aniversário da Ana', month: 10, day: 22 }] as never);
      vi.mocked(sendWhatsappTextMessage).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('whatsapp 500'));

      await run();

      expect(logImportantDateReminder).not.toHaveBeenCalled();
    });

    it('retrato financeiro: ontem, mês comparado e limite perto de estourar', async () => {
      vi.mocked(summarizeTransactions)
        .mockResolvedValueOnce({ totalIncomeCents: 0, totalExpenseCents: 8500, byCategory: {}, count: 1 }) // ontem
        .mockResolvedValueOnce({ totalIncomeCents: 0, totalExpenseCents: 234000, byCategory: { mercado: 90000 }, count: 9 }) // mês até ontem
        .mockResolvedValueOnce({ totalIncomeCents: 0, totalExpenseCents: 200000, byCategory: {}, count: 8 }); // mês passado, mesmo trecho
      vi.mocked(listBudgets).mockResolvedValue([{ category: 'mercado', limit_cents: 100000 }] as never);

      await run();

      const extras = sent()[1]!.replace(/\u00a0/g, ' ');
      expect(extras).toContain('💰 *Seu dinheiro*');
      expect(extras).toContain('• Ontem: R$ 85,00 em gastos');
      expect(extras).toContain('17% acima do mesmo período do mês passado');
      expect(extras).toContain('Mercado está em 90% do limite');
    });

    it('hábitos com sequência e meta com prazo chegando', async () => {
      vi.mocked(listActiveHabits).mockResolvedValue([{ id: 'h1', name: 'Caminhada' }] as never);
      vi.mocked(listHabitCheckinDates).mockResolvedValue({ h1: ['2026-10-21', '2026-10-20', '2026-10-19'] });
      vi.mocked(listGoals).mockResolvedValue([{ title: 'Viagem', saved_cents: 300000, target_cents: 500000, deadline: '2026-11-01' }] as never);

      await run();

      const extras = sent()[1]!.replace(/\u00a0/g, ' ');
      expect(extras).toContain('• Caminhada: 3 dias seguidos 🔥 — hoje ainda falta marcar');
      expect(extras).toContain('Meta Viagem: 60% (R$ 3.000,00 de R$ 5.000,00) — prazo em 10 dias');
    });

    it('prévia de amanhã com compromissos, tarefas e a previsão de amanhã', async () => {
      vi.mocked(getTodayAndTomorrowAgendaEvents).mockResolvedValue({ today: [], tomorrow: [{ startIso: '2026-10-23T12:00:00.000Z', title: 'Dentista' }] });
      vi.mocked(listPendingTasksDueBetween).mockResolvedValue([{ title: 'Ligar pro banco', due_at: '2026-10-23T15:00:00+00:00' }] as never);
      vi.mocked(getTodayWeatherSummary).mockResolvedValue({
        minTempC: 18,
        maxTempC: 28,
        description: 'céu limpo',
        conditionId: 800,
        rainExpected: false,
        rainChancePercent: 0,
        periods: { morning: null, afternoon: null, evening: null },
        tomorrow: { minTempC: 17, maxTempC: 29, description: 'chuva leve', conditionId: 500, rainChancePercent: 70 },
      });

      await run();

      const extras = sent().at(-1)!;
      expect(extras).toContain('🔜 *Amanhã*: 1 compromisso (9h — Dentista) e 1 tarefa');
      expect(extras).toContain('🌧️ 17°C a 29°C, chuva leve (70% de chuva)');
    });

    it('fonte de extras que falha some da mensagem sem derrubar as outras e sem afirmar dia livre errado', async () => {
      vi.mocked(listImportantDates).mockRejectedValue(new Error('db down'));
      vi.mocked(listActiveHabits).mockResolvedValue([{ id: 'h1', name: 'Leitura' }] as never);

      await run();

      expect(sent()).toHaveLength(2);
      expect(sent()[1]).toContain('Leitura');
      expect(sent()[1]).not.toContain('🗓️');
      expect(logger.error).toHaveBeenCalledWith('morning_digest_source_failed', expect.objectContaining({ source: 'extras_dates' }));
    });
  });

  describe('eficiência', () => {
    it('agenda de hoje+amanhã numa chamada só e tarefas numa consulta só (uma renovação de token, não duas)', async () => {
      await run();

      expect(getTodayAndTomorrowAgendaEvents).toHaveBeenCalledTimes(1);
      expect(listPendingTasksDueBetween).toHaveBeenCalledTimes(1);
    });

    it('tarefa de hoje e de amanhã saem da mesma consulta, separadas pelo instante (formato +00:00 do Supabase)', async () => {
      vi.mocked(listPendingTasksDueBetween).mockResolvedValue([
        { title: 'Pagar IPTU', due_at: '2026-10-22T20:00:00+00:00' },
        { title: 'Ligar pro banco', due_at: '2026-10-23T15:00:00+00:00' },
      ] as never);

      await run();

      expect(sent()[1]).toContain('Pagar IPTU');
      expect(sent()[1]).not.toContain('Ligar pro banco');
      expect(sent().at(-1)).toContain('1 tarefa');
    });

    it('total do mês que bateu no teto de 2000 transações é omitido em vez de mostrar número incompleto', async () => {
      vi.mocked(summarizeTransactions)
        .mockResolvedValueOnce({ totalIncomeCents: 0, totalExpenseCents: 8500, byCategory: {}, count: 1 })
        .mockResolvedValueOnce({ totalIncomeCents: 0, totalExpenseCents: 999999, byCategory: {}, count: 2000 })
        .mockResolvedValueOnce({ totalIncomeCents: 0, totalExpenseCents: 200000, byCategory: {}, count: 10 });

      await run();

      const extras = sent()[1]!.replace(/\u00a0/g, ' ');
      expect(extras).toContain('• Ontem: R$ 85,00 em gastos');
      expect(extras).not.toContain('No mês');
    });
  });
});
