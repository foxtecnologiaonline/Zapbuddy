import { describe, expect, it } from 'vitest';
import { eventsFromToolLogs, formatCheckinMessage, pickCheckinCandidate, type ToolLogLike } from './checkin.js';
import { formatDayClose, formatWeekReview } from './messages.js';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-10-29T18:00:00Z').getTime();
const nbsp = (text: string) => text.replace(/\u00a0/g, ' ');
const emojiCount = (line: string) => (line.match(/\p{Extended_Pictographic}/gu) ?? []).length;

function log(tool: string, parameters: Record<string, unknown>, result: unknown, at: string): ToolLogLike {
  return { tool_name: tool, parameters, result, created_at: at };
}

describe('eventsFromToolLogs', () => {
  it('reconstrói criação, edição e exclusão na ordem certa', () => {
    const events = eventsFromToolLogs([
      log('delete_calendar_event', { event_id: 'b' }, {}, '2026-10-29T10:00:00Z'),
      log('create_calendar_event', { summary: 'Dentista', end_at: '2026-10-29T15:00:00Z' }, { event_id: 'a' }, '2026-10-28T10:00:00Z'),
      log('create_calendar_event', { summary: 'Cancelado', end_at: '2026-10-29T15:00:00Z' }, { event_id: 'b' }, '2026-10-28T11:00:00Z'),
      log('update_calendar_event', { event_id: 'a', end_at: '2026-10-29T16:00:00Z', summary: 'Dentista (Dr. Paulo)' }, {}, '2026-10-28T12:00:00Z'),
    ]);
    expect(events).toEqual([{ eventId: 'a', title: 'Dentista (Dr. Paulo)', endIso: '2026-10-29T16:00:00Z' }]);
  });

  it('ignora log sem os campos necessários', () => {
    expect(eventsFromToolLogs([log('create_calendar_event', { summary: 'X' }, {}, '2026-10-28T10:00:00Z')])).toEqual([]);
  });
});

describe('pickCheckinCandidate', () => {
  const event = (id: string, endIso: string) => ({ eventId: id, title: `Evento ${id}`, endIso });

  it('só pega o que terminou entre 30min e 4h atrás', () => {
    const picked = pickCheckinCandidate(
      [event('recente', '2026-10-29T17:45:00Z'), event('ok', '2026-10-29T16:00:00Z'), event('velho', '2026-10-29T12:00:00Z'), event('futuro', '2026-10-29T19:00:00Z')],
      [],
      NOW,
      new Set(),
      TZ,
    );
    expect(picked?.ref).toBe('event:ok');
  });

  it('não repete o que já foi perguntado e escolhe o mais recente', () => {
    const events = [event('a', '2026-10-29T15:00:00Z'), event('b', '2026-10-29T16:30:00Z')];
    expect(pickCheckinCandidate(events, [], NOW, new Set(), TZ)?.ref).toBe('event:b');
    expect(pickCheckinCandidate(events, [], NOW, new Set(['event:b']), TZ)?.ref).toBe('event:a');
    expect(pickCheckinCandidate(events, [], NOW, new Set(['event:a', 'event:b']), TZ)).toBeNull();
  });

  it('tarefa sem hora de verdade (o dia todo) não gera check-in', () => {
    const tasks = [
      { id: 't1', title: 'Sem hora', dueIso: '2026-10-29T02:59:59Z' },
      { id: 't2', title: 'Com hora', dueIso: '2026-10-29T16:30:00Z' },
    ];
    expect(pickCheckinCandidate([], tasks, NOW, new Set(), TZ)).toMatchObject({ kind: 'task', taskId: 't2' });
  });

  it('mensagem estável por item, com no máximo 1 emoji por linha e citando o título', () => {
    const candidate = pickCheckinCandidate([event('a', '2026-10-29T16:00:00Z')], [], NOW, new Set(), TZ)!;
    const text = formatCheckinMessage(candidate);
    expect(text).toBe(formatCheckinMessage(candidate));
    expect(text).toContain('Evento a');
    for (const line of text.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
  });
});

describe('formatDayClose', () => {
  it('resume o dia em até 3 balões', () => {
    const text = nbsp(formatDayClose({
      name: 'Ana',
      completedTitles: ['Ligar pro contador', 'Pagar boleto'],
      spendCents: 12050,
      spendCount: 3,
      pendingTitles: ['Renovar CNH'],
      habitsMissing: ['Caminhar'],
      tomorrowText: '📅 *Seu dia amanhã*\n• 9h: Reunião\n\nHorários livres: 10h às 12h (2h).',
    }));
    expect(text.split(/\n\s*\n/).length).toBe(3);
    expect(text).toContain('Fechando o dia, Ana');
    expect(text).toContain('concluiu 2 tarefas');
    expect(text).toContain('R$ 120,50 em 3 lançamentos');
    expect(text).toContain('remarque o que ficou pendente');
    for (const line of text.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
  });

  it('dia vazio não vira cobrança', () => {
    const text = formatDayClose({ name: null, completedTitles: [], spendCents: 0, spendCount: 0, pendingTitles: [], habitsMissing: [], tomorrowText: null });
    expect(text).toContain('Dia tranquilo');
    expect(text).toContain('Descansa bem');
  });
});

describe('formatWeekReview', () => {
  it('compara gasto só quando as duas semanas têm', () => {
    const base = { name: null, completedCount: 5, habitCheckins: 3, pendingCount: 4, overdueCount: 0, nextWeekEvents: 2, nextWeekTasks: 3 };
    expect(nbsp(formatWeekReview({ ...base, spendCents: 20000, prevSpendCents: 10000 }))).toContain('+100% vs. semana anterior');
    expect(formatWeekReview({ ...base, spendCents: 20000, prevSpendCents: 0 })).not.toContain('vs. semana anterior');
    expect(formatWeekReview({ ...base, spendCents: 0, prevSpendCents: 0 })).not.toContain('Gastos');
  });

  it('mostra atraso quando há e fecha convidando a planejar', () => {
    const text = formatWeekReview({ name: 'Ana', completedCount: 0, spendCents: 0, prevSpendCents: 0, habitCheckins: 0, pendingCount: 2, overdueCount: 2, nextWeekEvents: 0, nextWeekTasks: 0 });
    expect(text).toContain('Atrasadas: 2');
    expect(text).toContain('ainda está livre');
    expect(text).toContain('plano pra segunda');
    for (const line of text.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
  });
});
