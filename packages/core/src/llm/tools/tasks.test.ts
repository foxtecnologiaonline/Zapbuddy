import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  completeTask: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  listTasks: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../../webhooks/dispatch.js', () => ({ enqueueWebhookEvent: vi.fn() }));

import { updateTaskTool } from './tasks.js';

const ctx = { userId: 'user-1', accountId: 'account-1' } as never;
const ID = '22222222-2222-4222-8222-222222222222';

describe('update_task', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remarca o prazo e devolve o estado novo', async () => {
    const due = new Date(Date.now() + 86_400_000).toISOString();
    db.updateTask.mockResolvedValueOnce({ id: ID, title: 'Reunião', due_at: due });

    const result = await updateTaskTool.execute({ task_id: ID, due_at: due }, ctx);

    expect(db.updateTask).toHaveBeenCalledWith('account-1', ID, { title: undefined, dueAt: due });
    expect(result).toEqual({ updated: true, task_id: ID, title: 'Reunião', due_at: due });
  });

  it('due_at null remove o prazo', async () => {
    db.updateTask.mockResolvedValueOnce({ id: ID, title: 'Reunião', due_at: null });
    await updateTaskTool.execute({ task_id: ID, due_at: null }, ctx);
    expect(db.updateTask).toHaveBeenCalledWith('account-1', ID, { title: undefined, dueAt: null });
  });

  it('sem nada pra alterar, recusa em vez de gravar um update vazio', async () => {
    await expect(updateTaskTool.execute({ task_id: ID }, ctx)).rejects.toThrow(/não há o que alterar/);
    expect(db.updateTask).not.toHaveBeenCalled();
  });

  it('id inexistente: updated false', async () => {
    db.updateTask.mockResolvedValueOnce(null);
    expect(await updateTaskTool.execute({ task_id: ID, title: 'Novo' }, ctx)).toEqual({ updated: false });
  });
});
