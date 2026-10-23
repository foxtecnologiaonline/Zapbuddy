import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  createHabit: vi.fn(),
  archiveHabit: vi.fn(),
  findActiveHabit: vi.fn(),
  listActiveHabits: vi.fn(),
  listHabitCheckinDates: vi.fn(),
  logHabitCheckin: vi.fn(),
}));
vi.mock('@zapbuddy/db', () => db);

import { logHabitCheckinTool, listHabitsTool, createHabitTool } from './habits.js';
import { localDateKey, shiftDateKey } from '../../habits/streak.js';

const TZ = 'America/Sao_Paulo';
const ctx = { userId: 'user-1', accountId: 'account-1', timezone: TZ } as never;
const HABIT_ID = '11111111-1111-4111-8111-111111111111';

describe('log_habit_checkin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marca hoje por padrão e devolve a sequência calculada', async () => {
    const today = localDateKey(TZ);
    db.findActiveHabit.mockResolvedValue({ id: HABIT_ID, name: 'Academia' });
    db.logHabitCheckin.mockResolvedValue({ checkin: { id: 'chk-1' }, created: true });
    db.listHabitCheckinDates.mockResolvedValue({ [HABIT_ID]: [today, shiftDateKey(today, -1)] });

    const result = await logHabitCheckinTool.execute({ habit_id: HABIT_ID }, ctx);

    expect(db.logHabitCheckin).toHaveBeenCalledWith('account-1', 'user-1', HABIT_ID, today);
    expect(result).toMatchObject({ logged: true, checkin_id: 'chk-1', current_streak: 2, last_7_days: 2 });
  });

  it('marcar o mesmo dia de novo é seguro e não devolve checkin_id', async () => {
    db.findActiveHabit.mockResolvedValue({ id: HABIT_ID, name: 'Academia' });
    db.logHabitCheckin.mockResolvedValue({ checkin: null, created: false });
    db.listHabitCheckinDates.mockResolvedValue({});

    const result = (await logHabitCheckinTool.execute({ habit_id: HABIT_ID }, ctx)) as Record<string, unknown>;

    expect(result.already_logged).toBe(true);
    expect(result).not.toHaveProperty('checkin_id');
  });

  it('recusa data futura e data antiga demais', async () => {
    const today = localDateKey(TZ);
    await expect(logHabitCheckinTool.execute({ habit_id: HABIT_ID, date: shiftDateKey(today, 1) }, ctx)).rejects.toThrow(/ainda não chegou/);
    await expect(logHabitCheckinTool.execute({ habit_id: HABIT_ID, date: shiftDateKey(today, -8) }, ctx)).rejects.toThrow(/dias pra trás/);
    expect(db.logHabitCheckin).not.toHaveBeenCalled();
  });

  it('hábito inexistente/arquivado não grava nada', async () => {
    db.findActiveHabit.mockResolvedValue(null);
    expect(await logHabitCheckinTool.execute({ habit_id: HABIT_ID }, ctx)).toEqual({ logged: false, reason: 'habit_not_found' });
    expect(db.logHabitCheckin).not.toHaveBeenCalled();
  });
});

describe('list_habits', () => {
  it('calcula sequência e "feito hoje" por hábito', async () => {
    const today = localDateKey(TZ);
    db.listActiveHabits.mockResolvedValue([
      { id: HABIT_ID, name: 'Academia' },
      { id: 'outro', name: 'Leitura' },
    ]);
    db.listHabitCheckinDates.mockResolvedValue({ [HABIT_ID]: [shiftDateKey(today, -1)] });

    const result = (await listHabitsTool.execute({}, ctx)) as { habits: Array<Record<string, unknown>> };

    expect(result.habits[0]).toMatchObject({ name: 'Academia', done_today: false, current_streak: 1, last_7_days: 1 });
    expect(result.habits[1]).toMatchObject({ name: 'Leitura', current_streak: 0 });
  });
});

describe('create_habit', () => {
  it('não duplica um hábito ativo com o mesmo nome', async () => {
    db.listActiveHabits.mockResolvedValue([{ id: HABIT_ID, name: 'Academia' }]);
    expect(await createHabitTool.execute({ name: '  academia ' }, ctx)).toEqual({ habit_id: HABIT_ID, created: false, already_exists: true });
    expect(db.createHabit).not.toHaveBeenCalled();
  });

  it('cria quando é novo', async () => {
    db.listActiveHabits.mockResolvedValue([]);
    db.createHabit.mockResolvedValue({ id: 'novo' });
    expect(await createHabitTool.execute({ name: 'Leitura' }, ctx)).toEqual({ habit_id: 'novo', created: true });
  });
});
