import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  claimProactiveMessage: vi.fn(),
  findListByName: vi.fn(),
  listAccountLists: vi.fn(),
  listItemsOfList: vi.fn(),
  listPendingItemCounts: vi.fn(),
  listTasks: vi.fn(),
  saveMorningDigestPreferences: vi.fn(),
  saveRoutinePrefs: vi.fn(),
  summarizeTransactions: vi.fn(),
  createReminder: vi.fn(),
  listPendingReminders: vi.fn(),
  listNotes: vi.fn(),
  listActiveRecurringBills: vi.fn(),
  listGoals: vi.fn(),
  listPersonalGoals: vi.fn(),
  listActiveHabits: vi.fn(),
  listHabitCheckinDates: vi.fn(),
  listImportantDates: vi.fn(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@zapbuddy/db', () => db);

const undo = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../llm/tools/undo.js', () => ({ undoLastActionTool: undo }));

const routines = vi.hoisted(() => ({
  selectSkillTip: vi.fn(),
  buildDayCloseMessage: vi.fn(),
  buildWeekReviewMessage: vi.fn(),
  buildMonthReviewMessage: vi.fn(),
  buildSuggestionMessage: vi.fn(),
}));
vi.mock('../routines/build.js', () => ({ ...routines, SKILL_TIP_KIND: 'skill_tip' }));

const queue = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../queues/definitions.js', () => ({ getReminderDispatchQueue: () => queue }));
vi.mock('../planning/day-overview.js', () => ({ loadDayOverview: vi.fn().mockResolvedValue({
  period: 'today', timeZone: 'America/Sao_Paulo', nowIso: '2026-10-29T12:00:00Z', calendarConnected: true, events: [], tasksDue: [], reminders: [],
  overdue: [], undated: [], undatedMore: false, habitsPending: [], freeWindows: [], failedSources: [],
}) }));

import { executeCommand } from './execute.js';
import { parseCommand } from './parse.js';
import { SKILLS } from './skills.js';

const user = { id: 'user-1', timezone: 'America/Sao_Paulo', quiet_hours_start: 22, quiet_hours_end: 7, morning_digest_hour: 8, preferred_name: null, name: 'Ana Souza' } as never;
const toolContext = { userId: 'user-1', accountId: 'acc-1', timezone: 'America/Sao_Paulo', whatsappNumber: '55', messageSource: 'text', role: 'owner' } as never;
const run = (text: string) => executeCommand(parseCommand(text)!, { user, toolContext });

beforeEach(() => vi.clearAllMocks());

describe('executeCommand', () => {
  it('ajuda: visão geral, assunto e assunto desconhecido', async () => {
    expect(await run('ajuda')).toContain('Seu tempo');
    expect(await run('ajuda listas')).toContain('Listas');
    expect(await run('ajuda xyzzy')).toContain('Não achei esse assunto');
  });

  it('hoje usa o panorama do dia', async () => {
    expect(await run('hoje')).toContain('está livre');
  });

  it('lista inexistente devolve null (o LLM entende; pode nem ser uma lista)', async () => {
    db.findListByName.mockResolvedValue(null);
    expect(await run('lista de compras')).toBeNull();
    db.findListByName.mockResolvedValue({ id: 'l1', name: 'Compras' });
    db.listItemsOfList.mockResolvedValue([{ text: 'leite', done: false }]);
    expect(await run('lista de compras')).toContain('⬜ leite');
  });

  it('desfazer traduz cada resultado da tool', async () => {
    undo.execute.mockResolvedValueOnce({ undone: true, undone_action: 'create_task' });
    expect(await run('desfazer')).toBe('Pronto, desfiz a tarefa.');
    undo.execute.mockResolvedValueOnce({ undone: false, reason: 'nothing_to_undo' });
    expect(await run('desfazer')).toContain('nada recente');
    undo.execute.mockResolvedValueOnce({ undone: false, reason: 'last_action_not_undoable' });
    expect(await run('desfaz')).toContain('não consigo desfazer');
    undo.execute.mockResolvedValueOnce({ undone: false, reason: 'unknown_target' });
    expect(await run('desfaz')).toBeNull();
  });

  it('liga e desliga resumo, dicas e rotinas', async () => {
    await run('desligar resumo');
    expect(db.saveMorningDigestPreferences).toHaveBeenCalledWith('user-1', { enabled: false });
    await run('ligar dicas');
    expect(db.saveRoutinePrefs).toHaveBeenCalledWith('user-1', { routine_weekly_tip: true });
    const on = await run('ligar fechamento do dia');
    expect(db.saveRoutinePrefs).toHaveBeenCalledWith('user-1', { routine_day_close: true });
    expect(on).toContain('20h');
    await run('desligar check-ins');
    expect(db.saveRoutinePrefs).toHaveBeenCalledWith('user-1', { routine_checkins: false });
  });

  it('dica: manda a próxima e marca; sem sobra, avisa', async () => {
    routines.selectSkillTip.mockResolvedValueOnce(SKILLS[0]);
    const tip = await run('dica');
    expect(tip).toContain('Uma dica do Tom');
    expect(db.claimProactiveMessage).toHaveBeenCalledWith('acc-1', 'skill_tip', SKILLS[0]!.id);
    routines.selectSkillTip.mockResolvedValueOnce(null);
    expect(await run('dica')).toContain('já conhece quase tudo');
  });

  it('foco agenda um lembrete e responde na hora', async () => {
    db.createReminder.mockResolvedValue({ id: 'rem-1' });
    const text = await run('foco 45');
    expect(text).toContain('45 minutos');
    expect(queue.add).toHaveBeenCalledWith('dispatch', { reminderId: 'rem-1' }, expect.objectContaining({ delay: 45 * 60_000 }));
  });

  it('fechamento do dia sob demanda; falha vira pedido de nova tentativa', async () => {
    routines.buildDayCloseMessage.mockResolvedValueOnce('🌙 *Fechando o dia*');
    expect(await run('fechamento do dia')).toBe('🌙 *Fechando o dia*');
    routines.buildDayCloseMessage.mockResolvedValueOnce(null);
    expect(await run('fechar o dia')).toContain('Tenta de novo');
  });

  it('gastos e tarefas usam só o que veio do banco', async () => {
    db.summarizeTransactions.mockResolvedValue({ totalExpenseCents: 0, totalIncomeCents: 0, byCategory: {}, count: 0 });
    expect(await run('gastos')).toContain('nenhum lançamento neste mês');
    db.listTasks.mockResolvedValue([]);
    expect(await run('tarefas')).toContain('nenhuma tarefa pendente');
  });
});

describe('atalhos de consulta (lembretes, notas, contas, metas, hábitos, datas)', () => {
  it('lembretes: lê os pendentes da conta e formata no fuso da pessoa', async () => {
    db.listPendingReminders.mockResolvedValue([{ message: 'ligar pro João', remind_at: '2099-01-02T12:00:00.000Z', recurrence: null }]);
    const text = await run('lembretes');
    expect(db.listPendingReminders).toHaveBeenCalledWith('acc-1', 15);
    expect(text).toContain('• ligar pro João (02/01, 9h)');
  });

  it('notas: as mais recentes da conta', async () => {
    db.listNotes.mockResolvedValue([{ content: 'ideia de presente', created_at: '2026-11-20T12:00:00.000Z' }]);
    expect(await run('minhas notas')).toContain('ideia de presente');
    expect(db.listNotes).toHaveBeenCalledWith('acc-1', 10);
  });

  it('contas: soma os valores que a pessoa informou', async () => {
    db.listActiveRecurringBills.mockResolvedValue([
      { name: 'Aluguel', amount_cents: 100000, due_day: 5 },
      { name: 'Internet', amount_cents: 10000, due_day: 10 },
    ]);
    expect(await run('contas')).toMatch(/Somam R\$\s?1\.100,00 por mês/);
  });

  it('metas: com valor (ativas) e pessoais (pendentes) vêm das fontes certas', async () => {
    db.listGoals.mockResolvedValue([{ title: 'Viagem', target_cents: 100000, saved_cents: 50000, deadline: null }]);
    db.listPersonalGoals.mockResolvedValue([{ description: 'ler mais' }]);
    const text = await run('metas');
    expect(db.listGoals).toHaveBeenCalledWith('acc-1', 'active');
    expect(db.listPersonalGoals).toHaveBeenCalledWith('acc-1', 'pending', 15);
    expect(text).toContain('(50%)');
    expect(text).toContain('• ler mais');
  });

  it('hábitos: sequência e "marcou hoje" calculados dos check-ins (chave de data local)', async () => {
    db.listActiveHabits.mockResolvedValue([{ id: 'h1', name: 'Caminhar' }]);
    db.listHabitCheckinDates.mockResolvedValue({ h1: [] });
    expect(await run('hábitos')).toContain('• Caminhar: 0 dias seguidos, falta marcar hoje (0 dos últimos 7 dias)');
  });

  it('datas: ordena pela próxima ocorrência', async () => {
    db.listImportantDates.mockResolvedValue([{ label: 'Aniversário da mãe', month: 3, day: 12 }]);
    expect(await run('datas importantes')).toContain('Aniversário da mãe');
  });

  it('coleção vazia ensina a criar, em vez de ficar muda', async () => {
    db.listPendingReminders.mockResolvedValue([]);
    db.listNotes.mockResolvedValue([]);
    expect(await run('lembretes')).toContain('me lembra de');
    expect(await run('notas')).toContain('anota:');
  });

  it('revisão do mês e sugestão usam os construtores; falha da revisão avisa sem inventar', async () => {
    routines.buildMonthReviewMessage.mockResolvedValueOnce('revisão pronta');
    expect(await run('revisão do mês')).toBe('revisão pronta');
    routines.buildMonthReviewMessage.mockResolvedValueOnce(null);
    expect(await run('fechamento do mês')).toContain('Não consegui montar');
    routines.buildSuggestionMessage.mockResolvedValueOnce('sugestões prontas');
    expect(await run('sugestão')).toBe('sugestões prontas');
  });
});
