import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  findLastSuccessfulToolCall: vi.fn(),
  deleteTransaction: vi.fn(),
  deleteTask: vi.fn(),
  deleteNote: vi.fn(),
  cancelReminder: vi.fn(),
  deactivateRecurringBill: vi.fn(),
  cancelGoal: vi.fn(),
  deleteImportantDate: vi.fn(),
  deletePersonalGoal: vi.fn(),
  deleteHabit: vi.fn(),
  deleteHabitCheckin: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../../calendar/calendar-access.js', () => ({ deleteCalendarEvent: vi.fn(), getFreshCalendarAccess: vi.fn() }));

import { undoLastActionTool } from './undo.js';

const ctx = { userId: 'user-1', accountId: 'account-1' } as never;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function toolCall(toolName: string, result: unknown, createdAt: string) {
  return { tool_name: toolName, result, created_at: createdAt };
}

describe('undo_last_action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não tem nada pra desfazer quando não há criação recente', async () => {
    db.findLastSuccessfulToolCall.mockResolvedValueOnce(null);
    const result = await undoLastActionTool.execute({}, ctx);
    expect(result).toEqual({ undone: false, reason: 'nothing_to_undo' });
    expect(db.deleteTransaction).not.toHaveBeenCalled();
  });

  it('não apaga a criação anterior quando a última ação foi uma edição (update_task)', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('create_task', { task_id: 'task-1', created: true }, minutesAgo(5)))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(toolCall('update_task', { updated: true }, minutesAgo(1)));

    const result = await undoLastActionTool.execute({}, ctx);

    expect(result).toEqual({ undone: false, reason: 'last_action_not_undoable', last_action: 'update_task' });
    expect(db.deleteTask).not.toHaveBeenCalled();
  });

  it('edição ANTERIOR à criação não atrapalha o desfazer', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('create_task', { task_id: 'task-1', created: true }, minutesAgo(1)))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(toolCall('update_task', { updated: true }, minutesAgo(5)));
    db.deleteTask.mockResolvedValueOnce({ id: 'task-1' });

    expect(await undoLastActionTool.execute({}, ctx)).toEqual({ undone: true, undone_action: 'create_task' });
  });

  it('desfaz o último lançamento pelo transaction_id do resultado', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('record_transaction', { transaction_id: 'tx-1', recorded: true }, minutesAgo(1)))
      .mockResolvedValueOnce(null);
    db.deleteTransaction.mockResolvedValueOnce(true);

    const result = await undoLastActionTool.execute({}, ctx);

    expect(db.deleteTransaction).toHaveBeenCalledWith('account-1', 'tx-1');
    expect(result).toEqual({ undone: true, undone_action: 'record_transaction' });
  });

  it('não desfaz de novo a mesma ação depois de já ter desfeito', async () => {
    const created = toolCall('create_note', { note_id: 'note-1', created: true }, minutesAgo(3));
    const earlierUndo = toolCall('undo_last_action', { undone: true }, minutesAgo(1));
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(earlierUndo);

    const result = await undoLastActionTool.execute({}, ctx);

    expect(db.deleteNote).not.toHaveBeenCalled();
    expect(result).toEqual({ undone: false, reason: 'nothing_to_undo' });
  });

  it('desfaz tarefa pelo task_id', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('create_task', { task_id: 'task-9', created: true }, minutesAgo(2)))
      .mockResolvedValueOnce(null);
    db.deleteTask.mockResolvedValueOnce({ id: 'task-9' });

    const result = await undoLastActionTool.execute({}, ctx);

    expect(db.deleteTask).toHaveBeenCalledWith('account-1', 'task-9');
    expect(result).toEqual({ undone: true, undone_action: 'create_task' });
  });

  it('desfaz uma data importante pelo important_date_id', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('remember_important_date', { important_date_id: 'date-1', remembered: true }, minutesAgo(2)))
      .mockResolvedValueOnce(null);
    db.deleteImportantDate.mockResolvedValueOnce({ id: 'date-1' });

    const result = await undoLastActionTool.execute({}, ctx);

    expect(db.deleteImportantDate).toHaveBeenCalledWith('account-1', 'date-1');
    expect(result).toEqual({ undone: true, undone_action: 'remember_important_date' });
  });

  it('desfaz uma meta pessoal pelo goal_id', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('create_personal_goal', { goal_id: 'pgoal-1', created: true }, minutesAgo(1)))
      .mockResolvedValueOnce(null);
    db.deletePersonalGoal.mockResolvedValueOnce({ id: 'pgoal-1' });

    const result = await undoLastActionTool.execute({}, ctx);

    expect(db.deletePersonalGoal).toHaveBeenCalledWith('account-1', 'pgoal-1');
    expect(result).toEqual({ undone: true, undone_action: 'create_personal_goal' });
  });

  it('desfaz um check-in de hábito pelo checkin_id', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('log_habit_checkin', { checkin_id: 'chk-1', logged: true }, minutesAgo(1)))
      .mockResolvedValueOnce(null);
    db.deleteHabitCheckin.mockResolvedValueOnce(true);

    const result = await undoLastActionTool.execute({}, ctx);

    expect(db.deleteHabitCheckin).toHaveBeenCalledWith('account-1', 'chk-1');
    expect(result).toEqual({ undone: true, undone_action: 'log_habit_checkin' });
  });

  it('check-in repetido (already_logged) não tem alvo pra desfazer', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('log_habit_checkin', { already_logged: true, logged: false }, minutesAgo(1)))
      .mockResolvedValueOnce(null);

    expect(await undoLastActionTool.execute({}, ctx)).toEqual({ undone: false, reason: 'unknown_target' });
  });

  it('informa quando o item já não existe mais', async () => {
    db.findLastSuccessfulToolCall
      .mockResolvedValueOnce(toolCall('create_reminder', { reminder_id: 'rem-1', scheduled: true }, minutesAgo(1)))
      .mockResolvedValueOnce(null);
    db.cancelReminder.mockResolvedValueOnce(null);

    const result = await undoLastActionTool.execute({}, ctx);

    expect(result).toEqual({ undone: false, reason: 'already_removed' });
  });
});
