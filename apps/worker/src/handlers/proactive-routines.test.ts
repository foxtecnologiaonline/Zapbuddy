import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({
  claimProactiveMessage: vi.fn(),
  countProactiveMessagesSince: vi.fn(),
  listPendingTasksDueBetween: vi.fn(),
  listProactiveRefs: vi.fn(),
  listSuccessfulToolCallsSince: vi.fn(),
  markTaskFollowUpAsked: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@zapbuddy/core', async () => {
  // As regras puras (janelas, mensagens) entram reais; só o IO é falso.
  const actual = await vi.importActual<typeof import('@zapbuddy/core')>('../../../../packages/core/src/index.ts');
  return { ...actual, deliverReply: vi.fn(), appendTurns: vi.fn(), buildDayCloseMessage: vi.fn(), buildWeekReviewMessage: vi.fn(), selectSkillTip: vi.fn() };
});

import { claimProactiveMessage, countProactiveMessagesSince, listPendingTasksDueBetween, listProactiveRefs, listSuccessfulToolCallsSince, markTaskFollowUpAsked } from '@zapbuddy/db';
import { appendTurns, buildDayCloseMessage, buildWeekReviewMessage, deliverReply, selectSkillTip, SKILLS } from '@zapbuddy/core';
import { runProactiveRoutines } from './proactive-routines.js';

const account = {
  accountId: 'acc-1',
  ownerUserId: 'user-1',
  ownerWhatsappNumber: '5511999999999',
  ownerTimezone: 'America/Sao_Paulo',
  quietHoursStart: 22,
  quietHoursEnd: 7,
  displayName: 'Ana',
  cityUf: null,
  cityLatitude: null,
  cityLongitude: null,
  morningDigestEnabled: true,
  morningDigestHour: 8,
  morningDigestAgenda: true,
  morningDigestFinance: true,
  morningDigestIndicators: [] as string[],
  indicatorsOffered: true,
  userCreatedAt: '2026-10-01T00:00:00Z',
  routineCheckins: true,
  routineWeeklyTip: true,
  routineDayClose: false,
  routineWeekReview: false,
};

// Quarta 2026-10-28 15:00 em São Paulo = 18:00Z
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(claimProactiveMessage).mockResolvedValue(true);
  vi.mocked(countProactiveMessagesSince).mockResolvedValue(0);
  vi.mocked(listPendingTasksDueBetween).mockResolvedValue([]);
  vi.mocked(listProactiveRefs).mockResolvedValue([]);
  vi.mocked(listSuccessfulToolCallsSince).mockResolvedValue([]);
  vi.mocked(appendTurns).mockResolvedValue(undefined);
  vi.mocked(deliverReply).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const eventLog = (endIso: string) => [
  { tool_name: 'create_calendar_event', parameters: { summary: 'Dentista', end_at: endIso }, result: { event_id: 'ev-1' }, created_at: '2026-10-28T10:00:00Z' },
];

describe('check-in pós-compromisso', () => {
  it('pergunta como foi, uma vez, e deixa o Tom saber na conversa', async () => {
    at('2026-10-28T18:00:00Z');
    vi.mocked(listSuccessfulToolCallsSince).mockResolvedValue(eventLog('2026-10-28T16:30:00Z') as never);

    await runProactiveRoutines(account, { localHour: 15, quiet: false });

    expect(claimProactiveMessage).toHaveBeenCalledWith('acc-1', 'checkin', 'event:ev-1');
    const sent = vi.mocked(deliverReply).mock.calls[0]![0];
    expect(sent.reply.text).toContain('Dentista');
    expect(sent.to).toBe('5511999999999');
    expect(appendTurns).toHaveBeenCalledWith('5511999999999', [expect.objectContaining({ role: 'assistant', content: sent.reply.text })]);
  });

  it('claim perdido (outra execução já mandou) não envia', async () => {
    at('2026-10-28T18:00:00Z');
    vi.mocked(listSuccessfulToolCallsSince).mockResolvedValue(eventLog('2026-10-28T16:30:00Z') as never);
    vi.mocked(claimProactiveMessage).mockResolvedValue(false);
    await runProactiveRoutines(account, { localHour: 15, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();
  });

  it('tarefa com hora vira check-in e marca a pergunta pra o resumo da manhã não repetir', async () => {
    at('2026-10-28T18:00:00Z');
    vi.mocked(listPendingTasksDueBetween).mockResolvedValue([{ id: 'task-1', title: 'Ligar pro contador', due_at: '2026-10-28T16:30:00Z' }] as never);
    await runProactiveRoutines(account, { localHour: 15, quiet: false });
    expect(markTaskFollowUpAsked).toHaveBeenCalledWith('acc-1', 'task-1');
    expect(vi.mocked(deliverReply).mock.calls[0]![0].reply.text).toContain('Ligar pro contador');
  });

  it.each([
    ['desligado pela pessoa', { ...account, routineCheckins: false }, { localHour: 15, quiet: false }],
    ['horário de silêncio', account, { localHour: 15, quiet: true }],
    ['de madrugada', account, { localHour: 5, quiet: false }],
    ['tarde da noite', account, { localHour: 21, quiet: false }],
  ])('não manda: %s', async (_label, acc, tick) => {
    at('2026-10-28T18:00:00Z');
    vi.mocked(listSuccessfulToolCallsSince).mockResolvedValue(eventLog('2026-10-28T16:30:00Z') as never);
    await runProactiveRoutines(acc, tick);
    expect(deliverReply).not.toHaveBeenCalled();
  });

  it('respeita o teto diário', async () => {
    at('2026-10-28T18:00:00Z');
    vi.mocked(listSuccessfulToolCallsSince).mockResolvedValue(eventLog('2026-10-28T16:30:00Z') as never);
    vi.mocked(countProactiveMessagesSince).mockResolvedValue(2);
    await runProactiveRoutines(account, { localHour: 15, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();
  });
});

describe('fechamento do dia (opt-in)', () => {
  const optedIn = { ...account, routineDayClose: true };

  it('às 20h manda uma vez por dia', async () => {
    at('2026-10-28T23:10:00Z');
    vi.mocked(buildDayCloseMessage).mockResolvedValue('🌙 *Fechando o dia, Ana*');
    await runProactiveRoutines(optedIn, { localHour: 20, quiet: false });
    expect(claimProactiveMessage).toHaveBeenCalledWith('acc-1', 'day_close', '2026-10-28');
    expect(deliverReply).toHaveBeenCalledTimes(1);
  });

  it('desligado por padrão e fora da hora não manda', async () => {
    at('2026-10-28T23:10:00Z');
    await runProactiveRoutines(account, { localHour: 20, quiet: false });
    await runProactiveRoutines(optedIn, { localHour: 19, quiet: false });
    expect(buildDayCloseMessage).not.toHaveBeenCalled();
    expect(deliverReply).not.toHaveBeenCalled();
  });

  it('mensagem que não deu pra montar não vira envio vazio', async () => {
    at('2026-10-28T23:10:00Z');
    vi.mocked(buildDayCloseMessage).mockResolvedValue(null);
    await runProactiveRoutines(optedIn, { localHour: 20, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();
  });
});

describe('revisão da semana (opt-in)', () => {
  const optedIn = { ...account, routineWeekReview: true };

  it('só no domingo às 18h', async () => {
    vi.mocked(buildWeekReviewMessage).mockResolvedValue('🗓️ *Sua semana em resumo*');
    at('2026-10-31T21:00:00Z'); // sábado 18h local
    await runProactiveRoutines(optedIn, { localHour: 18, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();

    at('2026-11-01T21:00:00Z'); // domingo 18h local
    await runProactiveRoutines(optedIn, { localHour: 18, quiet: false });
    expect(claimProactiveMessage).toHaveBeenCalledWith('acc-1', 'week_review', '2026-11-01');
    expect(deliverReply).toHaveBeenCalledTimes(1);
  });
});

describe('dica semanal de habilidade', () => {
  const skill = SKILLS.find((candidate) => candidate.id === 'listas')!;

  it('quarta às 11h, uma dica por vez, marcada pra nunca repetir', async () => {
    at('2026-10-28T14:00:00Z'); // quarta 11h local
    vi.mocked(selectSkillTip).mockResolvedValue(skill);
    await runProactiveRoutines(account, { localHour: 11, quiet: false });
    expect(claimProactiveMessage).toHaveBeenCalledWith('acc-1', 'skill_tip', 'listas');
    expect(vi.mocked(deliverReply).mock.calls[0]![0].reply.text).toContain('lista de compras');
  });

  it.each([
    ['conta nova demais', { ...account, userCreatedAt: '2026-10-27T00:00:00Z' }],
    ['dica desligada', { ...account, routineWeeklyTip: false }],
  ])('não manda: %s', async (_label, acc) => {
    at('2026-10-28T14:00:00Z');
    vi.mocked(selectSkillTip).mockResolvedValue(skill);
    await runProactiveRoutines(acc, { localHour: 11, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();
  });

  it('não manda se já saiu uma nos últimos 6 dias ou se não sobrou habilidade', async () => {
    at('2026-10-28T14:00:00Z');
    vi.mocked(countProactiveMessagesSince).mockResolvedValue(1);
    vi.mocked(selectSkillTip).mockResolvedValue(skill);
    await runProactiveRoutines(account, { localHour: 11, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();

    vi.mocked(countProactiveMessagesSince).mockResolvedValue(0);
    vi.mocked(selectSkillTip).mockResolvedValue(null);
    await runProactiveRoutines(account, { localHour: 11, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();
  });

  it('em outro dia da semana não manda', async () => {
    at('2026-10-29T14:00:00Z'); // quinta
    vi.mocked(selectSkillTip).mockResolvedValue(skill);
    await runProactiveRoutines(account, { localHour: 11, quiet: false });
    expect(deliverReply).not.toHaveBeenCalled();
  });
});

describe('isolamento de falhas', () => {
  it('uma rotina que quebra não impede as outras', async () => {
    at('2026-10-28T14:00:00Z');
    vi.mocked(countProactiveMessagesSince).mockRejectedValueOnce(new Error('db fora')); // check-in
    vi.mocked(selectSkillTip).mockResolvedValue(SKILLS.find((candidate) => candidate.id === 'listas')!);
    await expect(runProactiveRoutines(account, { localHour: 11, quiet: false })).resolves.toBeUndefined();
    expect(deliverReply).toHaveBeenCalledTimes(1); // a dica saiu
  });
});
