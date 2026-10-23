import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  updateTask: vi.fn(),
  updateNote: vi.fn(),
  updateReminder: vi.fn(),
  listPendingReminders: vi.fn(),
  createTask: vi.fn(),
  completeTask: vi.fn(),
  deleteTask: vi.fn(),
  listTasks: vi.fn(),
  createReminder: vi.fn(),
  cancelReminder: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
}));
const queue = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
const calendar = vi.hoisted(() => ({
  getFreshCalendarAccess: vi.fn(),
  listCalendarEvents: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../../queues/definitions.js', () => ({ getReminderDispatchQueue: () => queue }));
vi.mock('../../calendar/calendar-access.js', () => calendar);
vi.mock('../../webhooks/dispatch.js', () => ({ enqueueWebhookEvent: vi.fn() }));

import { updateTaskTool } from './tasks.js';
import { updateNoteTool } from './notes.js';
import { updateReminderTool, listRemindersTool } from './reminders.js';
import { updateCalendarEventTool, deleteCalendarEventTool, listCalendarEventsTool } from './calendar.js';

const ctx = { userId: 'user-1', accountId: 'account-1', timezone: 'America/Sao_Paulo' } as never;
const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();
const TASK_ID = '11111111-1111-4111-8111-111111111111';

describe('edição de tarefa e nota', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exige ao menos um campo pra alterar na tarefa', () => {
    expect(updateTaskTool.schema.safeParse({ task_id: TASK_ID }).success).toBe(false);
    expect(updateTaskTool.schema.safeParse({ task_id: TASK_ID, due_at: null }).success).toBe(true);
  });

  it('due_at: null remove o prazo; ausente deixa como está', async () => {
    db.updateTask.mockResolvedValue({ id: TASK_ID });
    await updateTaskTool.execute({ task_id: TASK_ID, due_at: null }, ctx);
    expect(db.updateTask).toHaveBeenCalledWith('account-1', TASK_ID, { title: undefined, dueAt: null });

    await updateTaskTool.execute({ task_id: TASK_ID, title: 'novo' }, ctx);
    expect(db.updateTask).toHaveBeenLastCalledWith('account-1', TASK_ID, { title: 'novo', dueAt: undefined });
  });

  it('devolve updated:false quando a tarefa/nota não existe na conta', async () => {
    db.updateTask.mockResolvedValue(null);
    db.updateNote.mockResolvedValue(null);
    expect(await updateTaskTool.execute({ task_id: TASK_ID, title: 'x' }, ctx)).toEqual({ updated: false });
    expect(await updateNoteTool.execute({ note_id: TASK_ID, content: 'x' }, ctx)).toEqual({ updated: false });
  });
});

describe('edição de lembrete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remarcar troca o job do BullMQ (mesmo jobId) e traduz recurrence "none" pra null', async () => {
    const remindAt = inOneHour();
    db.updateReminder.mockResolvedValue({ id: TASK_ID, remind_at: remindAt, recurrence: null });
    queue.remove.mockResolvedValue(1);

    const result = await updateReminderTool.execute({ reminder_id: TASK_ID, remind_at: remindAt, recurrence: 'none' }, ctx);

    expect(db.updateReminder).toHaveBeenCalledWith('account-1', TASK_ID, { message: undefined, remindAtIso: remindAt, recurrence: null });
    expect(queue.remove).toHaveBeenCalledWith(TASK_ID);
    expect(queue.add).toHaveBeenCalledWith('dispatch', { reminderId: TASK_ID }, expect.objectContaining({ jobId: TASK_ID }));
    expect(result).toMatchObject({ updated: true });
  });

  it('mudar só o texto não mexe na fila', async () => {
    db.updateReminder.mockResolvedValue({ id: TASK_ID, remind_at: inOneHour(), recurrence: null });
    await updateReminderTool.execute({ reminder_id: TASK_ID, message: 'novo texto' }, ctx);
    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.remove).not.toHaveBeenCalled();
  });

  it('lembrete que já disparou ou não existe → updated:false sem tocar na fila', async () => {
    db.updateReminder.mockResolvedValue(null);
    expect(await updateReminderTool.execute({ reminder_id: TASK_ID, remind_at: inOneHour() }, ctx)).toEqual({ updated: false });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejeita horário no passado (mesma regra do create_reminder)', async () => {
    await expect(updateReminderTool.execute({ reminder_id: TASK_ID, remind_at: '2020-01-01T10:00:00Z' }, ctx)).rejects.toThrow();
    expect(db.updateReminder).not.toHaveBeenCalled();
  });

  it('list_reminders expõe o reminder_id', async () => {
    db.listPendingReminders.mockResolvedValue([{ id: 'r1', message: 'm', remind_at: 'x', recurrence: 'daily' }]);
    expect(await listRemindersTool.execute({}, ctx)).toEqual({
      reminders: [{ reminder_id: 'r1', message: 'm', remind_at: 'x', recurrence: 'daily' }],
    });
  });
});

describe('edição de agenda', () => {
  beforeEach(() => vi.clearAllMocks());

  it('horário só vale em par (início e fim)', () => {
    expect(updateCalendarEventTool.schema.safeParse({ event_id: 'e', start_at: inOneHour() }).success).toBe(false);
    expect(updateCalendarEventTool.schema.safeParse({ event_id: 'e', summary: 'x' }).success).toBe(true);
    expect(updateCalendarEventTool.schema.safeParse({ event_id: 'e' }).success).toBe(false);
  });

  it('sem agenda conectada devolve connected:false', async () => {
    calendar.getFreshCalendarAccess.mockResolvedValue(null);
    expect(await updateCalendarEventTool.execute({ event_id: 'e', summary: 'x' }, ctx)).toEqual({ connected: false });
    expect(await deleteCalendarEventTool.execute({ event_id: 'e' }, ctx)).toEqual({ connected: false });
  });

  it('conflito ignora o próprio evento que está sendo remarcado', async () => {
    calendar.getFreshCalendarAccess.mockResolvedValue({ provider: 'google' });
    calendar.listCalendarEvents.mockResolvedValue([
      { id: 'e', summary: 'o próprio', startIso: 'a', endIso: 'b' },
      { id: 'outro', summary: 'dentista', startIso: 'c', endIso: 'd' },
    ]);
    calendar.updateCalendarEvent.mockResolvedValue({ id: 'e', htmlLink: 'link' });
    const start = inOneHour();
    const end = new Date(Date.now() + 7_200_000).toISOString();

    const result = (await updateCalendarEventTool.execute({ event_id: 'e', start_at: start, end_at: end }, ctx)) as { conflicts: unknown[] };

    expect(result.conflicts).toEqual([{ summary: 'dentista', start_at: 'c' }]);
    expect(calendar.updateCalendarEvent).toHaveBeenCalledWith({ provider: 'google' }, 'e', {
      summary: undefined,
      description: undefined,
      startIso: start,
      endIso: end,
    });
  });

  it('rejeita fim antes do início', async () => {
    await expect(
      updateCalendarEventTool.execute({ event_id: 'e', start_at: inOneHour(), end_at: new Date(Date.now()).toISOString() }, ctx),
    ).rejects.toThrow(/depois de start_at/);
  });

  it('listar exige period ou o par de datas, e usa as datas locais quando vêm', async () => {
    expect(listCalendarEventsTool.schema.safeParse({}).success).toBe(false);
    expect(listCalendarEventsTool.schema.safeParse({ from_date: '2026-10-30' }).success).toBe(false);

    calendar.getFreshCalendarAccess.mockResolvedValue({ provider: 'google' });
    calendar.listCalendarEvents.mockResolvedValue([{ id: 'e', summary: 'x', startIso: 's', endIso: 'f' }]);
    const result = await listCalendarEventsTool.execute({ from_date: '2026-10-30', to_date: '2026-10-30' }, ctx);
    expect(calendar.listCalendarEvents).toHaveBeenCalledWith(
      { provider: 'google' },
      '2026-10-30T03:00:00.000Z',
      '2026-10-31T02:59:59.000Z',
    );
    expect(result).toEqual({ connected: true, events: [{ event_id: 'e', summary: 'x', start_at: 's', end_at: 'f' }] });
  });
});
