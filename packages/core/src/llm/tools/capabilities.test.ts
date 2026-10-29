import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  addListItems: vi.fn(),
  clearDoneListItems: vi.fn(),
  deleteList: vi.fn(),
  findListByName: vi.fn(),
  getOrCreateList: vi.fn(),
  listAccountLists: vi.fn(),
  listItemsOfList: vi.fn(),
  listPendingItemCounts: vi.fn(),
  removeListItems: vi.fn(),
  setListItemsDone: vi.fn(),
  createInstallmentPlan: vi.fn(),
  listActiveInstallmentPlans: vi.fn(),
  cancelInstallmentPlan: vi.fn(),
  listActiveRecurringBills: vi.fn(),
  findUserById: vi.fn(),
  createReminder: vi.fn(),
  listPendingTasksDueBetween: vi.fn(),
  listOverduePendingTasks: vi.fn(),
  listUndatedPendingTasks: vi.fn(),
  listPendingReminders: vi.fn(),
  listActiveHabits: vi.fn(),
  listHabitCheckinDates: vi.fn(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@zapbuddy/db', () => db);

const queue = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../../queues/definitions.js', () => ({ getReminderDispatchQueue: () => queue }));
vi.mock('../../calendar/calendar-access.js', () => ({ getFreshCalendarAccess: vi.fn().mockResolvedValue(null), listCalendarEvents: vi.fn() }));

import { manageListTool } from './lists.js';
import { calculateTool } from './calculator.js';
import { manageInstallmentsTool } from './installments.js';
import { getDayOverviewTool, timeUtilsTool } from './time-utils.js';

const ctx = { userId: 'user-1', accountId: 'account-1', timezone: 'America/Sao_Paulo' } as never;
const item = (id: string, text: string, done = false) => ({ id, list_id: 'l1', account_id: 'account-1', text, done, done_at: null, created_at: '' });
const list = { id: 'l1', account_id: 'account-1', name: 'Compras', name_key: 'compras', created_at: '' };

beforeEach(() => vi.clearAllMocks());

describe('manage_list', () => {
  it('add cria a lista, ignora o que já está pendente e conta os pendentes', async () => {
    db.getOrCreateList.mockResolvedValue(list);
    db.listItemsOfList.mockResolvedValue([item('1', 'Leite'), item('2', 'Pão', true)]);
    db.addListItems.mockImplementation(async (_l: string, _a: string, texts: string[]) => texts.map((text, i) => item(`n${i}`, text)));

    const result = await manageListTool.execute({ action: 'add', list: 'compras', items: ['leite', 'café', 'pão'] }, ctx);

    expect(db.addListItems).toHaveBeenCalledWith('l1', 'account-1', ['café', 'pão']);
    expect(result).toMatchObject({ added: true, items_added: ['café', 'pão'], already_on_list: ['leite'], pending_count: 3 });
  });

  it('add sem nome de lista exige escolher quando há mais de uma', async () => {
    db.listAccountLists.mockResolvedValue([list, { ...list, id: 'l2', name: 'Viagem' }]);
    const result = await manageListTool.execute({ action: 'add', items: ['protetor solar'] }, ctx);
    expect(result).toMatchObject({ added: false, reason: 'list_name_required', lists: ['Compras', 'Viagem'] });
    expect(db.addListItems).not.toHaveBeenCalled();
  });

  it('check marca por texto aproximado e devolve ambiguidade sem chutar', async () => {
    db.findListByName.mockResolvedValue(list);
    db.listAccountLists.mockResolvedValue([list]);
    db.listItemsOfList.mockResolvedValue([item('1', 'ovos'), item('2', 'leite integral'), item('3', 'leite de aveia')]);
    db.setListItemsDone.mockResolvedValue([]);

    const result = await manageListTool.execute({ action: 'check', list: 'compras', items: ['ovo', 'leite', 'manteiga'] }, ctx);

    expect(db.setListItemsDone).toHaveBeenCalledWith('account-1', ['1'], true);
    expect(result).toMatchObject({
      updated: true,
      affected: ['ovos'],
      ambiguous: [{ query: 'leite', options: ['leite integral', 'leite de aveia'] }],
      not_found: ['manteiga'],
      pending_count: 2,
    });
  });

  it('uncheck só olha os marcados', async () => {
    db.findListByName.mockResolvedValue(list);
    db.listAccountLists.mockResolvedValue([list]);
    db.listItemsOfList.mockResolvedValue([item('1', 'pão', true), item('2', 'leite')]);
    const result = await manageListTool.execute({ action: 'uncheck', list: 'Compras', items: ['pão', 'leite'] }, ctx);
    expect(db.setListItemsDone).toHaveBeenCalledWith('account-1', ['1'], false);
    expect(result).toMatchObject({ affected: ['pão'], not_found: ['leite'], pending_count: 2 });
  });

  it('show de lista inexistente devolve as listas que existem', async () => {
    db.findListByName.mockResolvedValue(null);
    db.listAccountLists.mockResolvedValue([list]);
    expect(await manageListTool.execute({ action: 'show', list: 'presentes' }, ctx)).toEqual({ found: false, reason: 'list_not_found', lists: ['Compras'] });
  });

  it('delete e clear_done', async () => {
    db.findListByName.mockResolvedValue(list);
    db.listAccountLists.mockResolvedValue([list]);
    db.deleteList.mockResolvedValue(list);
    db.clearDoneListItems.mockResolvedValue(3);
    expect(await manageListTool.execute({ action: 'delete', list: 'compras' }, ctx)).toEqual({ deleted: true, list: 'Compras' });
    expect(await manageListTool.execute({ action: 'clear_done', list: 'compras' }, ctx)).toEqual({ cleared: 3, list: 'Compras' });
  });
});

describe('calculate', () => {
  const run = (params: Record<string, unknown>) => calculateTool.execute(params as never, ctx) as Promise<Record<string, unknown>>;
  const nbsp = (value: unknown) => String(value).replace(/ /g, ' ');

  it('expressão com porcentagem do jeito humano', async () => {
    expect(await run({ operation: 'expression', expression: '1200+8%' })).toMatchObject({ ok: true, result: 1296 });
    expect(await run({ operation: 'expression', expression: '15% * 380' })).toMatchObject({ ok: true, result: 57 });
  });

  it('expressão inválida volta como erro controlado, sem lançar', async () => {
    expect(await run({ operation: 'expression', expression: '2 +' })).toMatchObject({ ok: false });
    expect(await run({ operation: 'expression', expression: '10/0' })).toMatchObject({ ok: false });
  });

  it('racha a conta com gorjeta e distribui os centavos', async () => {
    const even = await run({ operation: 'split_bill', amount: 240, count: 4, percent: 10 });
    expect(nbsp(even.total_with_tip)).toBe('R$ 264,00');
    expect(nbsp(even.per_person)).toBe('R$ 66,00');

    const odd = await run({ operation: 'split_bill', amount: 100, count: 3 });
    expect(odd.per_person).toBeUndefined();
    expect(odd.per_person_amounts).toMatchObject({ people_paying_higher: 1 });
  });

  it('parcelamento sem e com juros, e total pela parcela', async () => {
    const plain = await run({ operation: 'installments', amount: 1000, count: 3 });
    expect(nbsp(plain.installment)).toBe('R$ 333,34');
    expect(nbsp(plain.total_paid)).toBe('R$ 1.000,00');
    expect(plain.interest_paid).toBeNull();

    const withInterest = await run({ operation: 'installments', amount: 1000, count: 10, percent: 2 });
    expect(withInterest.interest_paid).not.toBeNull();

    expect(nbsp((await run({ operation: 'installments_total', amount: 300, count: 10 })).total)).toBe('R$ 3.000,00');
  });

  it('variação percentual e juros compostos (só simulação)', async () => {
    expect(await run({ operation: 'percent_change', amount: 200, compare_to: 250 })).toMatchObject({ change_percent: 25 });
    expect(await run({ operation: 'percent_change', amount: 0, compare_to: 250 })).toMatchObject({ ok: false });
    expect(await run({ operation: 'compound_interest', amount: 1000, percent: 1, count: 12 })).toMatchObject({ ok: true, simulation_only: true });
  });

  it('pede o que falta em vez de calcular com lacuna', async () => {
    expect(await run({ operation: 'split_bill', amount: 100 })).toMatchObject({ ok: false, reason: 'amount_and_count_required' });
  });
});

describe('manage_installments', () => {
  const plan = {
    id: 'p1',
    account_id: 'account-1',
    description: 'Celular',
    installment_cents: 30000,
    total_installments: 10,
    first_due_month: '2026-11-01',
    due_day: 5,
    status: 'active',
    created_by_user_id: 'user-1',
    created_at: '',
  };

  it('create guarda o plano, mostra datas e deixa claro que não lançou gasto', async () => {
    db.createInstallmentPlan.mockResolvedValue(plan);
    const result = (await manageInstallmentsTool.execute(
      { action: 'create', description: 'Celular', installment_amount: 300, total_installments: 10, due_day: 5, first_due_month: '2026-11' },
      ctx,
    )) as Record<string, unknown>;
    expect(db.createInstallmentPlan).toHaveBeenCalledWith(expect.objectContaining({ installmentCents: 30000, totalInstallments: 10, firstDueMonth: '2026-11-01', dueDay: 5 }));
    expect(result).toMatchObject({ created: true, first_due_date: '2026-11-05', last_due_date: '2027-08-05', purchase_not_recorded_as_expense: true });
  });

  it('create sem campo obrigatório não grava', async () => {
    const result = await manageInstallmentsTool.execute({ action: 'create', description: 'Celular' }, ctx);
    expect(result).toMatchObject({ created: false });
    expect(db.createInstallmentPlan).not.toHaveBeenCalled();
  });

  it('commitments soma parcelas e contas recorrentes por mês', async () => {
    db.listActiveInstallmentPlans.mockResolvedValue([{ ...plan, first_due_month: '2099-01-01' }]);
    db.listActiveRecurringBills.mockResolvedValue([{ name: 'Aluguel', amount_cents: 150000, due_day: 28 }]);
    const result = (await manageInstallmentsTool.execute({ action: 'commitments', months: 2 }, ctx)) as { months: Array<{ month: string; recurring_bills: string }> };
    expect(result.months).toHaveLength(2);
    expect(result.months.every((month) => month.recurring_bills.length > 0)).toBe(true);
  });

  it('cancel escopado por conta', async () => {
    db.cancelInstallmentPlan.mockResolvedValue(null);
    expect(await manageInstallmentsTool.execute({ action: 'cancel', plan_id: '11111111-1111-4111-8111-111111111111' }, ctx)).toMatchObject({ cancelled: false });
    expect(db.cancelInstallmentPlan).toHaveBeenCalledWith('account-1', '11111111-1111-4111-8111-111111111111');
  });
});

describe('time_utils', () => {
  const run = (params: Record<string, unknown>) => timeUtilsTool.execute(params as never, ctx) as Promise<Record<string, unknown>>;

  it('hora em outro lugar e lugar desconhecido', async () => {
    expect(await run({ action: 'now_in', place: 'Lisboa' })).toMatchObject({ found: true, place: 'Lisboa' });
    expect(await run({ action: 'now_in', place: 'Atlântida' })).toEqual({ found: false });
    expect(await run({ action: 'now_in' })).toMatchObject({ found: false });
  });

  it('dias até uma data e data inválida', async () => {
    expect(await run({ action: 'days_until', date: '2099-01-01' })).toMatchObject({ ok: true });
    expect(await run({ action: 'days_until', date: '2026-02-31' })).toMatchObject({ ok: false, reason: 'invalid_date' });
  });

  it('próximo feriado nacional existe', async () => {
    expect(await run({ action: 'next_holiday' })).toHaveProperty('name');
  });

  it('foco vira lembrete comum na fila', async () => {
    db.createReminder.mockResolvedValue({ id: 'rem-1' });
    const result = await run({ action: 'focus', minutes: 25 });
    expect(result).toMatchObject({ scheduled: true, minutes: 25, reminder_id: 'rem-1' });
    expect(db.createReminder).toHaveBeenCalledWith('account-1', 'user-1', expect.stringContaining('25 minutos'), expect.any(String));
    expect(queue.add).toHaveBeenCalledWith('dispatch', { reminderId: 'rem-1' }, expect.objectContaining({ delay: 25 * 60_000, jobId: 'rem-1' }));
  });
});

describe('get_day_overview', () => {
  it('devolve o panorama sem expor fuso/instante internos e avisa fonte que falhou', async () => {
    db.findUserById.mockResolvedValue({ quiet_hours_start: 22, quiet_hours_end: 7 });
    db.listPendingTasksDueBetween.mockRejectedValue(new Error('db fora'));
    db.listPendingReminders.mockResolvedValue([]);
    db.listOverduePendingTasks.mockResolvedValue([]);
    db.listUndatedPendingTasks.mockResolvedValue([{ id: 't1', title: 'Ligar pro contador' }]);
    db.listActiveHabits.mockResolvedValue([]);
    db.listHabitCheckinDates.mockResolvedValue({});

    const result = (await getDayOverviewTool.execute({ period: 'today' }, ctx)) as Record<string, unknown>;

    expect(result.failedSources).toEqual(['tarefas']);
    expect(result.freeWindows).toEqual([]);
    expect(result).not.toHaveProperty('timeZone');
    expect(result.undated).toEqual([{ id: 't1', title: 'Ligar pro contador', dueIso: null }]);
  });
});
