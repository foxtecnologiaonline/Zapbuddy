import { describe, expect, it, vi } from 'vitest';

// Só os schemas são exercitados: nenhuma dependência de IO é chamada, então os módulos podem ser vazios.
vi.mock('@zapbuddy/db', () => ({}));
vi.mock('../../queues/definitions.js', () => ({}));
vi.mock('../../calendar/calendar-access.js', () => ({}));
vi.mock('../../webhooks/dispatch.js', () => ({}));

import { createCalendarEventTool, updateCalendarEventTool } from './calendar.js';
import { recordTransactionTool } from './finance.js';
import { createReminderTool, updateReminderTool } from './reminders.js';
import { createTaskTool, updateTaskTool } from './tasks.js';

/**
 * O prompt dá a hora LOCAL da pessoa e o deslocamento do fuso, então o modelo escreve "…-03:00". O `datetime()` padrão do zod só
 * aceitava "Z": a tool recusava e o modelo tinha que reconverter pra UTC de cabeça (erro de 3h num lembrete = lembrete na hora errada).
 */
const LOCAL = '2026-11-22T10:00:00-03:00';
const UTC = '2026-11-22T13:00:00Z';
const NAIVE = '2026-11-22T10:00:00'; // sem fuso: continua recusado — ambíguo

const cases: Array<[string, () => unknown, (value: string) => boolean]> = [
  ['create_task.due_at', () => createTaskTool.schema, (v) => createTaskTool.schema.safeParse({ title: 'x', due_at: v }).success],
  ['update_task.due_at', () => updateTaskTool.schema, (v) => updateTaskTool.schema.safeParse({ task_id: '5b1c1f0e-8d0e-4f55-9d9b-0c1e3e0b7a11', due_at: v }).success],
  ['create_reminder.remind_at', () => createReminderTool.schema, (v) => createReminderTool.schema.safeParse({ message: 'x', remind_at: v }).success],
  ['update_reminder.remind_at', () => updateReminderTool.schema, (v) => updateReminderTool.schema.safeParse({ reminder_id: '5b1c1f0e-8d0e-4f55-9d9b-0c1e3e0b7a11', remind_at: v }).success],
  ['record_transaction.occurred_at', () => recordTransactionTool.schema, (v) => recordTransactionTool.schema.safeParse({ type: 'expense', amount_cents: 100, category: 'outros', description: 'x', occurred_at: v }).success],
  ['create_calendar_event', () => createCalendarEventTool.schema, (v) => createCalendarEventTool.schema.safeParse({ summary: 'x', start_at: v, end_at: v }).success],
  ['update_calendar_event', () => updateCalendarEventTool.schema, (v) => updateCalendarEventTool.schema.safeParse({ event_id: 'e1', start_at: v, end_at: v }).success],
];

describe('datas das tools aceitam deslocamento de fuso', () => {
  it.each(cases)('%s: aceita -03:00 e Z, recusa sem fuso', (_name, _schema, parses) => {
    expect(parses(LOCAL)).toBe(true);
    expect(parses(UTC)).toBe(true);
    expect(parses(NAIVE)).toBe(false);
  });

  it('"-03:00" e "Z" são o mesmo instante (nada é reinterpretado)', () => {
    expect(new Date(LOCAL).getTime()).toBe(new Date(UTC).getTime());
  });
});
