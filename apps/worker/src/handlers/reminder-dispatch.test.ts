import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  findUserById: vi.fn(),
  findPendingReminderById: vi.fn(),
  markReminderSent: vi.fn(),
  createReminder: vi.fn(),
  listPendingReminders: vi.fn(),
}));
const core = vi.hoisted(() => ({
  sendWhatsappReminder: vi.fn(),
  hasReminderBeenDispatched: vi.fn(),
  markReminderDispatched: vi.fn(),
  recordProactiveMessage: vi.fn(),
  queueAdd: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zapbuddy/core')>()),
  sendWhatsappReminder: core.sendWhatsappReminder,
  hasReminderBeenDispatched: core.hasReminderBeenDispatched,
  markReminderDispatched: core.markReminderDispatched,
  recordProactiveMessage: core.recordProactiveMessage,
  getReminderDispatchQueue: () => ({ add: core.queueAdd }),
}));

import { handleReminderDispatch } from './reminder-dispatch.js';

const REMIND_AT = new Date(Date.now() - 5_000).toISOString();
const reminder = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  account_id: 'a1',
  user_id: 'u1',
  message: 'tomar remédio',
  remind_at: REMIND_AT,
  recurrence: null,
  task_id: null,
  status: 'pending',
  ...overrides,
});
const job = () => ({ data: { reminderId: 'r1' } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.findUserById.mockResolvedValue({ id: 'u1', whatsapp_number: '5511999990000' });
  db.findPendingReminderById.mockResolvedValue(reminder());
  db.markReminderSent.mockResolvedValue(undefined);
  db.listPendingReminders.mockResolvedValue([]);
  db.createReminder.mockResolvedValue({ id: 'r2' });
  core.sendWhatsappReminder.mockResolvedValue('text');
  core.hasReminderBeenDispatched.mockResolvedValue(false);
  core.markReminderDispatched.mockResolvedValue(undefined);
  core.recordProactiveMessage.mockResolvedValue(undefined);
  core.queueAdd.mockResolvedValue(undefined);
});

describe('handleReminderDispatch', () => {
  it('lembrete comum: envia, marca como enviado e não cria próxima ocorrência', async () => {
    await handleReminderDispatch(job());
    expect(core.sendWhatsappReminder).toHaveBeenCalledTimes(1);
    expect(db.markReminderSent).toHaveBeenCalledWith('r1');
    expect(db.createReminder).not.toHaveBeenCalled();
  });

  it('passa a mensagem do lembrete (não só o texto formatado) pro envio: é ela que vai no template quando a janela de 24h fechou', async () => {
    await handleReminderDispatch(job());
    expect(core.sendWhatsappReminder).toHaveBeenCalledWith('5511999990000', expect.stringContaining('tomar remédio'), 'tomar remédio');
  });

  it('o envio falhou (ex.: janela fechada e sem template): o job falha pro retry e NADA é marcado como disparado ou enviado', async () => {
    core.sendWhatsappReminder.mockRejectedValue(new Error('janela de 24h fechada'));
    await expect(handleReminderDispatch(job())).rejects.toThrow('janela de 24h fechada');
    expect(core.markReminderDispatched).not.toHaveBeenCalled();
    expect(db.markReminderSent).not.toHaveBeenCalled();
    expect(core.recordProactiveMessage).not.toHaveBeenCalled();
  });

  it('entregue por template também vale como entregue (marca, registra no histórico e conclui)', async () => {
    core.sendWhatsappReminder.mockResolvedValue('template');
    await handleReminderDispatch(job());
    expect(core.markReminderDispatched).toHaveBeenCalledWith('r1');
    expect(db.markReminderSent).toHaveBeenCalledWith('r1');
  });

  it('registra o lembrete na conversa DEPOIS de entregue: "adia pra amanhã" respondendo a ele precisa de contexto', async () => {
    const order: string[] = [];
    core.sendWhatsappReminder.mockImplementation(async () => void order.push('send'));
    core.markReminderDispatched.mockImplementation(async () => void order.push('dispatched'));
    core.recordProactiveMessage.mockImplementation(async () => void order.push('history'));

    await handleReminderDispatch(job());

    expect(order).toEqual(['send', 'dispatched', 'history']);
    expect(core.recordProactiveMessage).toHaveBeenCalledWith('5511999990000', expect.stringContaining('tomar remédio'));
  });

  it('retry depois de entregue não registra em dobro no histórico', async () => {
    core.hasReminderBeenDispatched.mockResolvedValue(true);
    await handleReminderDispatch(job());
    expect(core.recordProactiveMessage).not.toHaveBeenCalled();
  });

  it('já enviado ou cancelado (não está mais pending): não faz nada', async () => {
    db.findPendingReminderById.mockResolvedValue(null);
    await handleReminderDispatch(job());
    expect(core.sendWhatsappReminder).not.toHaveBeenCalled();
  });

  it('job velho de um lembrete remarcado (horário novo no futuro): não envia', async () => {
    db.findPendingReminderById.mockResolvedValue(reminder({ remind_at: new Date(Date.now() + 3_600_000).toISOString() }));
    await handleReminderDispatch(job());
    expect(core.sendWhatsappReminder).not.toHaveBeenCalled();
  });

  it('retry depois de o envio ter dado certo: não manda a notificação de novo', async () => {
    core.hasReminderBeenDispatched.mockResolvedValue(true);
    await handleReminderDispatch(job());
    expect(core.sendWhatsappReminder).not.toHaveBeenCalled();
    expect(db.markReminderSent).toHaveBeenCalledWith('r1');
  });
});

describe('lembrete recorrente', () => {
  const recurring = () => reminder({ recurrence: 'daily' });

  it('cria e enfileira a próxima ocorrência ANTES de marcar a atual como enviada (se falhar no meio, o retry ainda a encontra pending)', async () => {
    db.findPendingReminderById.mockResolvedValue(recurring());
    const order: string[] = [];
    db.createReminder.mockImplementation(async () => {
      order.push('create-next');
      return { id: 'r2' };
    });
    core.queueAdd.mockImplementation(async () => {
      order.push('enqueue-next');
    });
    db.markReminderSent.mockImplementation(async () => {
      order.push('mark-sent');
    });

    await handleReminderDispatch(job());

    expect(order).toEqual(['create-next', 'enqueue-next', 'mark-sent']);
    expect(core.queueAdd).toHaveBeenCalledWith('dispatch', { reminderId: 'r2' }, expect.objectContaining({ jobId: 'r2' }));
  });

  it('falha ao criar a próxima: o job FALHA (o BullMQ tenta de novo) e a atual NÃO é marcada como enviada — antes a série morria em silêncio', async () => {
    db.findPendingReminderById.mockResolvedValue(recurring());
    db.createReminder.mockRejectedValueOnce(new Error('supabase fora'));

    await expect(handleReminderDispatch(job())).rejects.toThrow('supabase fora');
    expect(db.markReminderSent).not.toHaveBeenCalled();

    // retry: o aviso já foi entregue (flag) e a próxima agora é criada
    core.hasReminderBeenDispatched.mockResolvedValue(true);
    await handleReminderDispatch(job());
    expect(core.sendWhatsappReminder).toHaveBeenCalledTimes(1); // não reenviou
    expect(db.createReminder).toHaveBeenCalledTimes(2);
    expect(db.markReminderSent).toHaveBeenCalledWith('r1');
  });

  it('retry depois de a próxima já ter sido criada (a falha foi no passo seguinte): reaproveita, não gera uma segunda série', async () => {
    db.findPendingReminderById.mockResolvedValue(recurring());
    const nextAt = new Date(new Date(REMIND_AT).getTime() + 24 * 3_600_000).toISOString();
    db.listPendingReminders.mockResolvedValue([reminder({ id: 'r2', remind_at: nextAt, recurrence: 'daily' })]);

    await handleReminderDispatch(job());

    expect(db.createReminder).not.toHaveBeenCalled();
    expect(core.queueAdd).toHaveBeenCalledWith('dispatch', { reminderId: 'r2' }, expect.objectContaining({ jobId: 'r2' }));
    expect(db.markReminderSent).toHaveBeenCalledWith('r1');
  });

  it('outro lembrete pendente com texto igual mas OUTRO horário não conta como a próxima', async () => {
    db.findPendingReminderById.mockResolvedValue(recurring());
    db.listPendingReminders.mockResolvedValue([reminder({ id: 'x', remind_at: new Date(Date.now() + 3_600_000).toISOString(), recurrence: 'daily' })]);
    await handleReminderDispatch(job());
    expect(db.createReminder).toHaveBeenCalledTimes(1);
  });
});
