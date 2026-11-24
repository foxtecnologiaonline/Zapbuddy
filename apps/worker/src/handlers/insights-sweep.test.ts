import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  listAccountsForInsightsSweep: vi.fn(),
  hasSentProactiveInsightToday: vi.fn(),
  hasSentWeeklyDigestSince: vi.fn(),
  listImportantDatesForAccountOnDate: vi.fn(),
  hasSentImportantDateReminderThisYear: vi.fn(),
  listProactiveOptOuts: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const queues = vi.hoisted(() => ({
  insights: { add: vi.fn() },
  weekly: { add: vi.fn() },
  importantDate: { add: vi.fn() },
  morning: { add: vi.fn() },
}));
const clock = vi.hoisted(() => ({ hour: 12, weekday: 3 }));
const handlers = vi.hoisted(() => ({
  reconcile: vi.fn(),
  nudge: vi.fn(),
  backfill: vi.fn(),
  routines: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zapbuddy/core')>()),
  getLocalHour: () => clock.hour,
  getLocalWeekday: () => clock.weekday,
  getLocalDateParts: () => ({ year: 2026, month: 11, day: 21 }),
  getTodayRange: () => ({ startIso: '2026-11-21T03:00:00.000Z', endIso: '2026-11-22T02:59:59.000Z' }),
  getInsightsGenerateQueue: () => queues.insights,
  getWeeklyDigestGenerateQueue: () => queues.weekly,
  getImportantDateReminderQueue: () => queues.importantDate,
  getMorningDigestGenerateQueue: () => queues.morning,
}));
vi.mock('./proactive-research.js', () => ({ handleProactiveResearch: vi.fn() }));
vi.mock('./interpretation-feedback.js', () => ({ handleInterpretationFeedback: vi.fn() }));
vi.mock('./logs-retention.js', () => ({ handleLogsRetention: vi.fn() }));
vi.mock('./reminders-reconcile.js', () => ({ reconcileOverdueReminders: handlers.reconcile }));
vi.mock('./onboarding-nudge.js', () => ({ handleOnboardingNudge: handlers.nudge }));
vi.mock('./embeddings-backfill.js', () => ({ handleEmbeddingsBackfill: handlers.backfill }));
vi.mock('./proactive-routines.js', () => ({ runProactiveRoutines: handlers.routines }));

import { handleInsightsSweep } from './insights-sweep.js';

/**
 * A regra do BullMQ 5 (node_modules/bullmq/dist/esm/classes/job.js): um jobId que contém ":" precisa ter EXATAMENTE 3
 * partes, senão `Queue.add` lança "Custom Id cannot contain :". O id do insight tinha 2 partes e o insight das 19h nunca
 * foi enfileirado; como não havia nenhum teste do sweep, ninguém viu.
 */
const isValidBullmqJobId = (id: string): boolean => !(id.includes(':') && id.split(':').length !== 3);

const account = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'acc-1',
  ownerUserId: 'user-1',
  ownerOnboarded: true,
  ownerWhatsappNumber: '5511999999999',
  ownerTimezone: 'America/Sao_Paulo',
  quietHoursStart: 22,
  quietHoursEnd: 7,
  displayName: 'Marina',
  cityUf: null,
  cityLatitude: null,
  cityLongitude: null,
  morningDigestEnabled: true,
  morningDigestHour: 8,
  morningDigestAgenda: true,
  morningDigestFinance: true,
  morningDigestIndicators: [],
  indicatorsOffered: true,
  userCreatedAt: '2026-01-01T00:00:00.000Z',
  routineCheckins: true,
  routineWeeklyTip: true,
  routineDayClose: false,
  routineWeekReview: false,
  ...overrides,
});

const allJobIds = (): string[] =>
  [queues.insights, queues.weekly, queues.importantDate, queues.morning].flatMap((q) => q.add.mock.calls.map((call) => (call[2] as { jobId: string }).jobId));

beforeEach(() => {
  vi.clearAllMocks();
  clock.hour = 12;
  clock.weekday = 3;
  db.listAccountsForInsightsSweep.mockResolvedValue([account()]);
  db.hasSentProactiveInsightToday.mockResolvedValue(false);
  db.hasSentWeeklyDigestSince.mockResolvedValue(false);
  db.hasSentImportantDateReminderThisYear.mockResolvedValue(false);
  db.listProactiveOptOuts.mockResolvedValue({ insightsOff: new Set<string>(), weeklyDigestOff: new Set<string>() });
  db.listImportantDatesForAccountOnDate.mockResolvedValue([{ id: 'imp-1', label: 'Aniversário da mãe' }]);
  handlers.nudge.mockResolvedValue(undefined);
  handlers.backfill.mockResolvedValue(undefined);
  handlers.routines.mockResolvedValue(undefined);
  for (const q of Object.values(queues)) q.add.mockResolvedValue({});
});

describe('insights-sweep — jobIds aceitos pelo BullMQ', () => {
  it('insight das 19h: enfileira com jobId de 3 partes (antes lançava e o insight nunca saía)', async () => {
    clock.hour = 19;
    await handleInsightsSweep({} as never);

    expect(queues.insights.add).toHaveBeenCalledTimes(1);
    const jobId = (queues.insights.add.mock.calls[0]![2] as { jobId: string }).jobId;
    expect(jobId).toBe('insight:acc-1:2026-11-21');
    expect(isValidBullmqJobId(jobId)).toBe(true);
    expect(isValidBullmqJobId('acc-1:2026-11-21')).toBe(false); // o formato antigo, que a regra recusa
  });

  it('TODO jobId de TODA fila do sweep obedece à regra (bom dia, insight, data importante, resumo semanal)', async () => {
    // Hora e dia em que as 4 filas disparam juntas: 8h (bom dia) NÃO coincide com 9h/18h/19h, então varre cada hora.
    const seen: string[] = [];
    for (const [hour, weekday] of [[8, 3], [9, 3], [18, 5], [19, 3]] as const) {
      vi.clearAllMocks();
      clock.hour = hour;
      clock.weekday = weekday;
      db.listAccountsForInsightsSweep.mockResolvedValue([account({ morningDigestHour: 8 })]);
      db.hasSentProactiveInsightToday.mockResolvedValue(false);
      db.hasSentWeeklyDigestSince.mockResolvedValue(false);
      db.hasSentImportantDateReminderThisYear.mockResolvedValue(false);
      db.listImportantDatesForAccountOnDate.mockResolvedValue([{ id: 'imp-1', label: 'x' }]);
      for (const q of Object.values(queues)) q.add.mockResolvedValue({});
      await handleInsightsSweep({} as never);
      seen.push(...allJobIds());
    }
    expect(seen.length).toBe(4); // as 4 filas foram exercitadas
    for (const id of seen) expect(isValidBullmqJobId(id), `jobId inválido pro BullMQ: ${id}`).toBe(true);
    expect(seen.some((id) => id.startsWith('morning:'))).toBe(true);
    expect(seen.some((id) => id.startsWith('insight:'))).toBe(true);
    expect(seen.some((id) => id.startsWith('important-date:'))).toBe(true);
    expect(seen.some((id) => id.startsWith('digest:'))).toBe(true);
  });
});

describe('insights-sweep — robustez', () => {
  it('uma conta que falha NÃO derruba as outras nem faz o sweep lançar (o retry reenviaria o nudge)', async () => {
    clock.hour = 19;
    db.listAccountsForInsightsSweep.mockResolvedValue([account({ accountId: 'ruim' }), account({ accountId: 'boa' })]);
    queues.insights.add.mockRejectedValueOnce(new Error('Custom Id cannot contain :')).mockResolvedValue({});

    await expect(handleInsightsSweep({} as never)).resolves.toBeUndefined();

    expect(queues.insights.add).toHaveBeenCalledTimes(2);
    expect(db.logger.error).toHaveBeenCalledWith('insights_sweep_account_failed', expect.objectContaining({ accountId: 'ruim' }));
  });

  it('reconcilia os lembretes vencidos (job perdido no Redis) em toda passada', async () => {
    await handleInsightsSweep({} as never);
    expect(handlers.reconcile).toHaveBeenCalledTimes(1);
  });

  it('listar as contas falhou: lança ANTES de qualquer efeito (o retry do BullMQ não repete nudge nem backfill)', async () => {
    db.listAccountsForInsightsSweep.mockRejectedValue(new Error('supabase fora'));
    await expect(handleInsightsSweep({} as never)).rejects.toThrow('supabase fora');
    expect(handlers.nudge).not.toHaveBeenCalled();
    expect(handlers.backfill).not.toHaveBeenCalled();
  });

  it('quem nunca fez o cadastro não recebe bom dia, insight nem rotinas (só o reengajamento do onboarding)', async () => {
    clock.hour = 8;
    db.listAccountsForInsightsSweep.mockResolvedValue([account({ ownerOnboarded: false })]);
    await handleInsightsSweep({} as never);
    expect(allJobIds()).toEqual([]);
    expect(handlers.routines).not.toHaveBeenCalled();
  });

  it('falha do nudge não derruba o resto do sweep', async () => {
    clock.hour = 19;
    handlers.nudge.mockRejectedValue(new Error('send falhou'));
    await expect(handleInsightsSweep({} as never)).resolves.toBeUndefined();
    expect(queues.insights.add).toHaveBeenCalledTimes(1);
    expect(db.logger.error).toHaveBeenCalledWith('onboarding_nudge_sweep_failed', expect.any(Object));
  });

  it('horário de silêncio segura bom dia e insight, mas as rotinas ainda recebem o estado', async () => {
    clock.hour = 23; // dentro do silêncio 22–7
    db.listAccountsForInsightsSweep.mockResolvedValue([account({ morningDigestHour: 23 })]);
    await handleInsightsSweep({} as never);
    expect(allJobIds()).toEqual([]);
    expect(handlers.routines).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }), { localHour: 23, quiet: true });
  });
});

describe('insights-sweep — opt-out do insight das 19h e do resumo semanal', () => {
  const optOut = (insights: string[], weekly: string[]) => ({ insightsOff: new Set(insights), weeklyDigestOff: new Set(weekly) });

  it('quem desligou o insight não recebe o das 19h; quem não desligou continua recebendo', async () => {
    clock.hour = 19;
    db.listAccountsForInsightsSweep.mockResolvedValue([account({ accountId: 'acc-off', ownerUserId: 'user-off' }), account({ accountId: 'acc-on', ownerUserId: 'user-on' })]);
    db.listProactiveOptOuts.mockResolvedValue(optOut(['user-off'], []));

    await handleInsightsSweep({} as never);

    expect(queues.insights.add).toHaveBeenCalledTimes(1);
    expect((queues.insights.add.mock.calls[0]![2] as { jobId: string }).jobId).toContain('acc-on');
  });

  it('quem desligou o resumo semanal não recebe o de sexta 18h (e o insight dessa pessoa segue, se ela não o desligou)', async () => {
    clock.hour = 18;
    clock.weekday = 5;
    db.listAccountsForInsightsSweep.mockResolvedValue([account({ accountId: 'acc-off', ownerUserId: 'user-off' })]);
    db.listProactiveOptOuts.mockResolvedValue(optOut([], ['user-off']));

    await handleInsightsSweep({} as never);

    expect(queues.weekly.add).not.toHaveBeenCalled();
  });

  it('o opt-out do insight NÃO afeta o bom dia nem o aviso de data importante (esses ela pediu)', async () => {
    clock.hour = 9;
    db.listAccountsForInsightsSweep.mockResolvedValue([account({ ownerUserId: 'user-off', morningDigestHour: 9 })]);
    db.listProactiveOptOuts.mockResolvedValue(optOut(['user-off'], ['user-off']));

    await handleInsightsSweep({} as never);

    expect(queues.morning.add).toHaveBeenCalledTimes(1);
    expect(queues.importantDate.add).toHaveBeenCalledTimes(1);
  });

  it('sem ninguém desligado (ou migration 0031 por aplicar): comportamento de antes — todo mundo recebe', async () => {
    clock.hour = 19;
    await handleInsightsSweep({} as never);
    expect(queues.insights.add).toHaveBeenCalledTimes(1);
  });
});
