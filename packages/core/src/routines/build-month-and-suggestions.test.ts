import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  summarizeTransactions: vi.fn(),
  listCompletedTasksBetween: vi.fn(),
  countHabitCheckinsSince: vi.fn(),
  listActiveRecurringBills: vi.fn(),
  listOverduePendingTasks: vi.fn(),
  listTasks: vi.fn(),
  listActiveHabits: vi.fn(),
  listHabitCheckinDates: vi.fn(),
  listGoals: vi.fn(),
  listPersonalGoals: vi.fn(),
  listPendingReminders: vi.fn(),
  listImportantDates: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@zapbuddy/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@zapbuddy/db')>()), ...db }));
vi.mock('../planning/day-overview.js', () => ({ loadDayOverview: vi.fn() }));
vi.mock('../planning/day-format.js', () => ({ formatDayOverview: vi.fn() }));

import { buildMonthReviewMessage, buildSuggestionMessage, type RoutineSubject } from './build.js';

const subject: RoutineSubject = { accountId: 'acc-1', timeZone: 'America/Sao_Paulo', quietHoursStart: 22, quietHoursEnd: 7, name: 'Ana' };
const MID_MONTH = new Date('2026-11-15T15:00:00.000Z'); // dia 15, 12h em SP
const FIRST_OF_MONTH = new Date('2026-11-01T15:00:00.000Z');
const summary = (expense: number, income = 0, byCategory: Record<string, number> = {}) => ({ totalExpenseCents: expense, totalIncomeCents: income, byCategory, count: expense > 0 ? 1 : 0 });

beforeEach(() => {
  vi.clearAllMocks();
  db.summarizeTransactions.mockResolvedValue(summary(0));
  db.listCompletedTasksBetween.mockResolvedValue([]);
  db.countHabitCheckinsSince.mockResolvedValue(0);
  db.listActiveRecurringBills.mockResolvedValue([{ amount_cents: 1000 }]); // cenário base: a pessoa já tem conta fixa guardada
  db.listOverduePendingTasks.mockResolvedValue([]);
  db.listTasks.mockResolvedValue([]);
  db.listActiveHabits.mockResolvedValue([]);
  db.listHabitCheckinDates.mockResolvedValue({});
  db.listGoals.mockResolvedValue([{ id: 'g' }]);
  db.listPersonalGoals.mockResolvedValue([]);
  db.listPendingReminders.mockResolvedValue([{ id: 'r' }]);
  db.listImportantDates.mockResolvedValue([]);
});

describe('buildMonthReviewMessage', () => {
  it('meio do mês: revisa até ONTEM e compara com o MESMO trecho do mês passado (dia 1 a 14 nos dois)', async () => {
    db.summarizeTransactions.mockImplementation(async (_account: string, from: string) =>
      from.startsWith('2026-11-01') ? summary(150000, 0, { alimentacao: 90000, lazer: 60000 }) : summary(100000),
    );
    db.listCompletedTasksBetween.mockResolvedValue(new Array(7).fill({}));
    db.countHabitCheckinsSince.mockResolvedValue(4);
    db.listActiveRecurringBills.mockResolvedValue([{ amount_cents: 120000 }]);

    const text = await buildMonthReviewMessage(subject, MID_MONTH);

    const calls = db.summarizeTransactions.mock.calls as Array<[string, string, string]>;
    expect(calls[0]![1]).toMatch(/^2026-11-01T03:00/); // 00h de 01/11 em SP
    expect(calls[0]![2]).toMatch(/^2026-11-15T02:59:59/); // fim de ontem (14/11, 23h59 em SP)
    expect(calls[1]![1]).toMatch(/^2026-10-01T03:00/);
    expect(calls[1]![2]).toMatch(/^2026-10-15T02:59:59/); // mesmo trecho (dia 14) do mês passado
    expect(db.countHabitCheckinsSince).toHaveBeenCalledWith('acc-1', '2026-11-01');
    expect(text).toContain('*Seu novembro até ontem, Ana*');
    expect(text).toContain('(+50% vs. mesmo trecho do mês passado)');
    expect(text).toContain('✅ Tarefas concluídas: 7');
    expect(text).toContain('💪 Hábitos marcados: 4 vezes');
  });

  it('dia 1: o mês atual está vazio, então fecha o mês PASSADO inteiro, sem comparação e sem hábitos (não há limite superior)', async () => {
    db.summarizeTransactions.mockResolvedValue(summary(200000, 500000));

    const text = await buildMonthReviewMessage(subject, FIRST_OF_MONTH);

    expect(db.summarizeTransactions).toHaveBeenCalledTimes(1);
    const [, from, to] = db.summarizeTransactions.mock.calls[0] as [string, string, string];
    expect(from).toMatch(/^2026-10-01T03:00/);
    expect(to).toMatch(/^2026-11-01T02:59:59/); // 31/10 23h59 em SP
    expect(db.countHabitCheckinsSince).not.toHaveBeenCalled();
    expect(text).toContain('*Fechamento de outubro, Ana*');
    expect(text).not.toContain('vs.');
  });

  it('virada de ano: no dia 1º de janeiro o fechamento é de dezembro do ano anterior', async () => {
    const text = await buildMonthReviewMessage(subject, new Date('2027-01-01T15:00:00.000Z'));
    const [, from] = db.summarizeTransactions.mock.calls[0] as [string, string];
    expect(from).toMatch(/^2026-12-01T03:00/);
    expect(text).toContain('Fechamento de dezembro');
  });

  it('o gasto falhou mas as tarefas vieram: ainda responde, sem inventar gasto', async () => {
    db.summarizeTransactions.mockRejectedValue(new Error('banco'));
    db.listCompletedTasksBetween.mockResolvedValue(new Array(3).fill({}));
    const text = await buildMonthReviewMessage(subject, MID_MONTH);
    expect(text).toContain('✅ Tarefas concluídas: 3');
    expect(text).not.toContain('Gastos');
  });

  it('nem gasto nem tarefas puderam ser lidos: null (melhor não responder do que dizer "mês vazio" sem saber)', async () => {
    db.summarizeTransactions.mockRejectedValue(new Error('banco'));
    db.listCompletedTasksBetween.mockRejectedValue(new Error('banco'));
    expect(await buildMonthReviewMessage(subject, MID_MONTH)).toBeNull();
  });
});

describe('buildSuggestionMessage', () => {
  it('tudo em ordem: não inventa sugestão', async () => {
    expect(await buildSuggestionMessage(subject, MID_MONTH)).toContain('Está tudo em ordem');
  });

  it('usa só o que leu: tarefas atrasadas, hábito pendente e data próxima', async () => {
    db.listOverduePendingTasks.mockResolvedValue(new Array(4).fill({}));
    db.listActiveHabits.mockResolvedValue([{ id: 'h1', name: 'Caminhar' }]);
    db.listHabitCheckinDates.mockResolvedValue({ h1: [] });
    db.listImportantDates.mockResolvedValue([{ label: 'Aniversário da Ana', month: 11, day: 16 }]);

    const text = await buildSuggestionMessage(subject, MID_MONTH);

    expect(text).toContain('Você tem 4 tarefas atrasadas');
    expect(text).toContain('Aniversário da Ana é amanhã.');
    expect(text).toContain('Falta marcar hoje: Caminhar.');
  });

  it('a leitura de metas falhou: NÃO diz "você não tem meta" (não conferiu)', async () => {
    db.listGoals.mockRejectedValue(new Error('banco'));
    expect(await buildSuggestionMessage(subject, MID_MONTH)).not.toContain('nenhuma meta');
  });

  it('metas lidas e realmente vazias: sugere a primeira', async () => {
    db.listGoals.mockResolvedValue([]);
    db.listPersonalGoals.mockResolvedValue([]);
    expect(await buildSuggestionMessage(subject, MID_MONTH)).toContain('Você ainda não tem nenhuma meta.');
  });

  it('gasto do mês muito acima do mesmo trecho do mês passado vira sugestão; sem base anterior, não', async () => {
    db.summarizeTransactions.mockImplementation(async (_a: string, from: string) => (from.startsWith('2026-11-01') ? summary(150000) : summary(100000)));
    expect(await buildSuggestionMessage(subject, MID_MONTH)).toContain('50% acima do mesmo trecho do mês passado');

    db.summarizeTransactions.mockImplementation(async (_a: string, from: string) => (from.startsWith('2026-11-01') ? summary(150000) : summary(0)));
    expect(await buildSuggestionMessage(subject, MID_MONTH)).not.toContain('acima do mesmo trecho');
  });

  it('no máximo 3 sugestões, na ordem de prioridade', async () => {
    db.listOverduePendingTasks.mockResolvedValue(new Array(5).fill({}));
    db.listGoals.mockResolvedValue([]);
    db.listPersonalGoals.mockResolvedValue([]);
    db.listActiveRecurringBills.mockResolvedValue([]);
    db.listPendingReminders.mockResolvedValue([]);
    const text = await buildSuggestionMessage(subject, MID_MONTH);
    expect((text.match(/^• /gm) ?? []).length).toBe(3);
    expect(text.indexOf('tarefas atrasadas')).toBeLessThan(text.indexOf('nenhuma meta'));
  });
});
