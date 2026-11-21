import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  listDueReminders: vi.fn(),
  markReminderFailed: vi.fn(),
  findUserById: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const queue = vi.hoisted(() => ({ add: vi.fn() }));
const clock = vi.hoisted(() => ({ hour: 14 }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zapbuddy/core')>()),
  getReminderDispatchQueue: () => queue,
  getLocalHour: () => clock.hour,
}));

import { RECONCILE_BATCH_LIMIT, RECONCILE_GRACE_MS, reconcileOverdueReminders } from './reminders-reconcile.js';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const reminder = (id: string, remindAt: string, userId = 'u1') => ({ id, user_id: userId, remind_at: remindAt, status: 'pending' });

beforeEach(() => {
  vi.clearAllMocks();
  clock.hour = 14;
  db.listDueReminders.mockResolvedValue([]);
  db.markReminderFailed.mockResolvedValue(undefined);
  db.findUserById.mockResolvedValue({ id: 'u1', timezone: 'America/Sao_Paulo', quiet_hours_start: 22, quiet_hours_end: 7 });
  queue.add.mockResolvedValue(undefined);
});

describe('reconcileOverdueReminders', () => {
  it('só olha lembretes vencidos há mais de 10 min (um job normal dispara em segundos)', async () => {
    await reconcileOverdueReminders(NOW);
    expect(db.listDueReminders).toHaveBeenCalledWith(new Date(NOW.getTime() - RECONCILE_GRACE_MS).toISOString());
  });

  it('vencido há 2h e ainda pending = job perdido: reenfileira com o PRÓPRIO id como jobId (se o job existir, o BullMQ ignora e nada vai em dobro)', async () => {
    db.listDueReminders.mockResolvedValue([reminder('r1', minutesAgo(120))]);

    await reconcileOverdueReminders(NOW);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith('dispatch', { reminderId: 'r1' }, { jobId: 'r1' });
    expect(db.markReminderFailed).not.toHaveBeenCalled();
  });

  it('vencido há mais de 24h: marca failed com o motivo, não manda lembrete de ontem e não fica pending pra sempre', async () => {
    db.listDueReminders.mockResolvedValue([reminder('old', minutesAgo(25 * 60))]);

    await reconcileOverdueReminders(NOW);

    expect(db.markReminderFailed).toHaveBeenCalledWith('old', expect.stringContaining('24h'));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('dentro do horário de silêncio da pessoa (no fuso dela): adia, não acorda de madrugada', async () => {
    clock.hour = 3;
    db.listDueReminders.mockResolvedValue([reminder('r1', minutesAgo(300))]);

    await reconcileOverdueReminders(NOW);

    expect(queue.add).not.toHaveBeenCalled();
    expect(db.markReminderFailed).not.toHaveBeenCalled(); // ainda pending: a próxima passada tenta de novo
  });

  it('o silêncio não segura além de 24h: expira mesmo assim', async () => {
    clock.hour = 3;
    db.listDueReminders.mockResolvedValue([reminder('old', minutesAgo(26 * 60))]);
    await reconcileOverdueReminders(NOW);
    expect(db.markReminderFailed).toHaveBeenCalledTimes(1);
  });

  it('pessoa que não existe mais: ignora (mesmo critério do despacho)', async () => {
    db.findUserById.mockResolvedValue(null);
    db.listDueReminders.mockResolvedValue([reminder('r1', minutesAgo(60))]);
    await reconcileOverdueReminders(NOW);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('falha num lembrete não impede os outros', async () => {
    db.listDueReminders.mockResolvedValue([reminder('a', minutesAgo(90)), reminder('b', minutesAgo(60))]);
    queue.add.mockRejectedValueOnce(new Error('redis fora')).mockResolvedValue(undefined);

    await reconcileOverdueReminders(NOW);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(db.logger.error).toHaveBeenCalledWith('reminder_reconcile_item_failed', expect.objectContaining({ reminderId: 'a' }));
  });

  it('banco fora do ar: não lança (manutenção nunca derruba o sweep)', async () => {
    db.listDueReminders.mockRejectedValue(new Error('supabase fora'));
    await expect(reconcileOverdueReminders(NOW)).resolves.toBeUndefined();
    expect(db.logger.error).toHaveBeenCalledWith('reminders_reconcile_failed', expect.any(Object));
  });

  it('depois de uma queda longa, processa no máximo um lote por passada, dos mais antigos pros mais novos', async () => {
    const many = Array.from({ length: RECONCILE_BATCH_LIMIT + 50 }, (_, i) => reminder(`r${i}`, minutesAgo(30 + i)));
    db.listDueReminders.mockResolvedValue(many);

    await reconcileOverdueReminders(NOW);

    expect(queue.add).toHaveBeenCalledTimes(RECONCILE_BATCH_LIMIT);
    // o mais antigo (maior i) entra primeiro
    expect(queue.add.mock.calls[0]![1]).toEqual({ reminderId: `r${RECONCILE_BATCH_LIMIT + 49}` });
    expect(db.logger.warn).toHaveBeenCalledWith('reminders_reconciled', expect.objectContaining({ truncated: true }));
  });
});
