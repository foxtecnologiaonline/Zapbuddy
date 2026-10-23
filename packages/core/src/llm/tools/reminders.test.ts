import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  createReminder: vi.fn(),
  cancelReminder: vi.fn(),
  listAccountReminders: vi.fn(),
  findAccountReminderById: vi.fn(),
}));
const queue = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../../queues/definitions.js', () => ({ getReminderDispatchQueue: () => queue }));

import { rescheduleReminderTool, listRemindersTool } from './reminders.js';

const ctx = { userId: 'user-1', accountId: 'account-1' } as never;
const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();
const ID = '11111111-1111-4111-8111-111111111111';

function reminder(overrides: Record<string, unknown> = {}) {
  return { id: ID, message: 'pagar o DAS', remind_at: inOneHour(), status: 'pending', recurrence: null, task_id: null, ...overrides };
}

describe('reschedule_reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue.remove.mockResolvedValue(undefined);
    db.createReminder.mockResolvedValue({ id: 'new-id' });
  });

  it('pendente: cancela o antigo, remove o job e agenda o novo com a mesma mensagem e recorrência', async () => {
    db.findAccountReminderById.mockResolvedValueOnce(reminder({ recurrence: 'weekly' }));
    const when = inOneHour();

    const result = await rescheduleReminderTool.execute({ reminder_id: ID, remind_at: when }, ctx);

    expect(db.cancelReminder).toHaveBeenCalledWith('account-1', ID);
    expect(queue.remove).toHaveBeenCalledWith(ID);
    expect(db.createReminder).toHaveBeenCalledWith('account-1', 'user-1', 'pagar o DAS', when, undefined, 'weekly');
    expect(queue.add).toHaveBeenCalledWith('dispatch', { reminderId: 'new-id' }, expect.objectContaining({ jobId: 'new-id' }));
    expect(result).toEqual({ rescheduled: true, reminder_id: 'new-id', remind_at: when });
  });

  it('já disparado: cria um avulso (a série recorrente já foi encadeada) e não cancela nada', async () => {
    db.findAccountReminderById.mockResolvedValueOnce(reminder({ status: 'sent', recurrence: 'daily' }));

    await rescheduleReminderTool.execute({ reminder_id: ID, remind_at: inOneHour() }, ctx);

    expect(db.cancelReminder).not.toHaveBeenCalled();
    expect(db.createReminder).toHaveBeenCalledWith('account-1', 'user-1', 'pagar o DAS', expect.any(String), undefined, undefined);
  });

  it('id inexistente ou já cancelado: rescheduled false, nada é criado', async () => {
    db.findAccountReminderById.mockResolvedValueOnce(null);
    expect(await rescheduleReminderTool.execute({ reminder_id: ID, remind_at: inOneHour() }, ctx)).toEqual({ rescheduled: false });

    db.findAccountReminderById.mockResolvedValueOnce(reminder({ status: 'cancelled' }));
    expect(await rescheduleReminderTool.execute({ reminder_id: ID, remind_at: inOneHour() }, ctx)).toEqual({ rescheduled: false });
    expect(db.createReminder).not.toHaveBeenCalled();
  });

  it('rejeita horário no passado antes de tocar em qualquer coisa', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    await expect(rescheduleReminderTool.execute({ reminder_id: ID, remind_at: past }, ctx)).rejects.toThrow();
    expect(db.findAccountReminderById).not.toHaveBeenCalled();
  });
});

describe('list_reminders', () => {
  it('junta os próximos pendentes e os últimos já disparados, com o reminder_id', async () => {
    db.listAccountReminders.mockImplementation(async (_account: string, status: string) =>
      status === 'pending' ? [reminder({ id: 'p1' })] : [reminder({ id: 's1', status: 'sent' })],
    );

    const result = (await listRemindersTool.execute({}, ctx)) as { reminders: Array<{ reminder_id: string; status: string }> };

    expect(result.reminders.map((r) => [r.reminder_id, r.status])).toEqual([['p1', 'pending'], ['s1', 'sent']]);
  });
});
