import { describe, expect, it } from 'vitest';
import { formatDayOverview, formatDuration, type DayOverviewData } from './day-format.js';
import { formatPendingTasks } from './tasks-format.js';

const TZ = 'America/Sao_Paulo';

function base(overrides: Partial<DayOverviewData> = {}): DayOverviewData {
  return {
    period: 'today',
    timeZone: TZ,
    nowIso: '2026-10-29T12:00:00.000Z',
    calendarConnected: true,
    events: [],
    tasksDue: [],
    reminders: [],
    overdue: [],
    undated: [],
    undatedMore: false,
    habitsPending: [],
    freeWindows: [],
    failedSources: [],
    ...overrides,
  };
}

const emojiCount = (line: string) => (line.match(/\p{Extended_Pictographic}/gu) ?? []).length;

describe('formatDayOverview', () => {
  it('dia livre só é afirmado quando as fontes foram lidas', () => {
    expect(formatDayOverview(base())).toContain('está livre: nada na agenda');
    expect(formatDayOverview(base({ calendarConnected: false }))).toContain('tarefas e lembretes');
    const failed = formatDayOverview(base({ failedSources: ['agenda'] }));
    expect(failed).toContain('Não consegui ver a agenda');
    expect(failed).not.toContain('livre');
  });

  it('ordena por horário e mistura agenda, tarefas e lembretes', () => {
    const text = formatDayOverview(
      base({
        events: [{ title: 'Reunião', startIso: '2026-10-29T17:00:00Z', endIso: '2026-10-29T18:00:00Z' }],
        tasksDue: [
          { id: '1', title: 'Ligar pro contador', dueIso: '2026-10-29T13:00:00Z' },
          { id: '2', title: 'Pagar boleto', dueIso: '2026-10-30T02:59:59Z' },
        ],
        reminders: [{ message: 'Tomar remédio', atIso: '2026-10-29T20:30:00Z' }],
      }),
    );
    const lines = text.split('\n');
    const order = ['Ligar pro contador', 'Reunião', 'Tomar remédio', 'Pagar boleto'].map((needle) => lines.findIndex((line) => line.includes(needle)));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('14h às 15h: Reunião');
  });

  it('em até 3 blocos e com no máximo 1 emoji por linha', () => {
    const text = formatDayOverview(
      base({
        events: [{ title: 'Dentista', startIso: '2026-10-29T14:00:00Z', endIso: '2026-10-29T15:00:00Z' }],
        overdue: [{ id: '3', title: 'Renovar CNH', dueIso: '2026-10-20T12:00:00Z' }],
        undated: [{ id: '4', title: 'Ligar pra mãe', dueIso: null }],
        habitsPending: ['Caminhar'],
        freeWindows: [{ startIso: '2026-10-29T15:00:00Z', endIso: '2026-10-29T20:00:00Z', minutes: 300 }],
      }),
    );
    expect(text.split(/\n\s*\n/).length).toBeLessThanOrEqual(3);
    for (const line of text.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
    expect(text).toContain('Horários livres: 12h às 17h (5h)');
  });

  it('semana vira uma mensagem só, agrupada por dia', () => {
    const text = formatDayOverview(
      base({
        period: 'week',
        events: [
          { title: 'Reunião', startIso: '2026-10-29T17:00:00Z', endIso: '2026-10-29T18:00:00Z' },
          { title: 'Viagem', startIso: '2026-10-31', endIso: '2026-11-01' },
        ],
        tasksDue: [{ id: '1', title: 'Entregar relatório', dueIso: '2026-10-30T13:00:00Z' }],
      }),
    );
    expect(text).not.toMatch(/\n\s*\n/);
    expect(text).toContain('quinta-feira (29/10)');
    expect(text).toContain('sexta-feira (30/10)');
    expect(text).toContain('o dia todo: Viagem');
  });

  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(150)).toBe('2h30');
  });
});

describe('formatPendingTasks', () => {
  const now = new Date('2026-10-29T15:00:00Z');
  it('vazio', () => {
    expect(formatPendingTasks([], TZ, now)).toContain('nenhuma tarefa pendente');
  });

  it('atrasadas, com prazo e sem data, nessa ordem', () => {
    const text = formatPendingTasks(
      [
        { title: 'Sem data', dueIso: null },
        { title: 'Futura', dueIso: '2026-11-02T15:00:00Z' },
        { title: 'Velha', dueIso: '2026-10-20T15:00:00Z' },
        { title: 'Hoje', dueIso: '2026-10-30T02:59:59Z' },
      ],
      TZ,
      now,
    );
    const idx = (needle: string) => text.indexOf(needle);
    expect(idx('Velha')).toBeLessThan(idx('Hoje'));
    expect(idx('Hoje')).toBeLessThan(idx('Futura'));
    expect(idx('Futura')).toBeLessThan(idx('Sem data'));
    expect(text).toContain('(era 20/10, 12h)');
    expect(text).toContain('Hoje (hoje)');
  });

  it('corta no teto e avisa quantas ficaram de fora', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, dueIso: null }));
    expect(formatPendingTasks(tasks, TZ, now)).toContain('…e mais 5.');
  });
});
