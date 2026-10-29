import { taskHourLabel } from '../digest/morning.js';

/**
 * Check-in pós-evento/tarefa (sugestão #6): "como foi?" depois que o
 * compromisso passou. Puro — quem busca os dados e envia é o sweep. Só pergunta
 * sobre o que a pessoa de fato tem registrado: evento que o Tom criou (lido do
 * log de tool calls, sem chamar a agenda de ninguém toda hora) e tarefa com
 * hora marcada ainda pendente.
 */

export const CHECKIN_MIN_AFTER_MINUTES = 30;
export const CHECKIN_MAX_AFTER_MINUTES = 240;
export const CHECKIN_DAILY_CAP = 2;
export const CHECKIN_FIRST_HOUR = 8;
export const CHECKIN_LAST_HOUR = 20;

export interface ToolLogLike {
  tool_name: string;
  parameters: Record<string, unknown>;
  result: unknown;
  created_at: string;
}

export interface KnownEvent {
  eventId: string;
  title: string;
  endIso: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Reconstrói os eventos criados pelo Tom (e ainda existentes) a partir do log, do mais antigo pro mais novo. */
export function eventsFromToolLogs(logs: ToolLogLike[]): KnownEvent[] {
  const events = new Map<string, KnownEvent>();
  for (const log of [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (log.tool_name === 'create_calendar_event') {
      const eventId = asString((log.result as Record<string, unknown> | null)?.event_id);
      const title = asString(log.parameters.summary);
      const endIso = asString(log.parameters.end_at);
      if (eventId && title && endIso) events.set(eventId, { eventId, title, endIso });
    } else if (log.tool_name === 'update_calendar_event') {
      const eventId = asString(log.parameters.event_id);
      const current = eventId ? events.get(eventId) : undefined;
      if (eventId && current) {
        events.set(eventId, {
          eventId,
          title: asString(log.parameters.summary) ?? current.title,
          endIso: asString(log.parameters.end_at) ?? current.endIso,
        });
      }
    } else if (log.tool_name === 'delete_calendar_event') {
      const eventId = asString(log.parameters.event_id);
      if (eventId) events.delete(eventId);
    }
  }
  return [...events.values()];
}

export interface CheckinTaskInput {
  id: string;
  title: string;
  dueIso: string;
}

export type CheckinCandidate =
  | { kind: 'event'; ref: string; title: string; endedAtMs: number }
  | { kind: 'task'; ref: string; title: string; endedAtMs: number; taskId: string };

/** O mais recente que terminou entre 30min e 4h atrás e ainda não foi perguntado. */
export function pickCheckinCandidate(
  events: KnownEvent[],
  tasks: CheckinTaskInput[],
  nowMs: number,
  askedRefs: ReadonlySet<string>,
  timeZone: string,
): CheckinCandidate | null {
  const earliest = nowMs - CHECKIN_MAX_AFTER_MINUTES * 60_000;
  const latest = nowMs - CHECKIN_MIN_AFTER_MINUTES * 60_000;
  const inWindow = (ms: number) => ms >= earliest && ms <= latest;

  const candidates: CheckinCandidate[] = [];
  for (const event of events) {
    const endedAtMs = new Date(event.endIso).getTime();
    const ref = `event:${event.eventId}`;
    if (Number.isFinite(endedAtMs) && inWindow(endedAtMs) && !askedRefs.has(ref)) candidates.push({ kind: 'event', ref, title: event.title, endedAtMs });
  }
  for (const task of tasks) {
    const endedAtMs = new Date(task.dueIso).getTime();
    const ref = `task:${task.id}`;
    // Sem hora de verdade (00:00/23:59 = "o dia todo") não dá pra saber quando "passou".
    if (!taskHourLabel(task.dueIso, timeZone)) continue;
    if (Number.isFinite(endedAtMs) && inWindow(endedAtMs) && !askedRefs.has(ref)) candidates.push({ kind: 'task', ref, title: task.title, endedAtMs, taskId: task.id });
  }
  candidates.sort((a, b) => b.endedAtMs - a.endedAtMs);
  return candidates[0] ?? null;
}

const EVENT_TEMPLATES: Array<(title: string) => string> = [
  (title) => `Como foi "${title}"?\nSe rolou algo que vale guardar, me conta que eu anoto ou viro tarefa.`,
  (title) => `E aí, como foi "${title}"?\nSe saiu alguma pendência disso, me fala que eu registro.`,
  (title) => `Já passou "${title}", né?\nComo foi? Se tiver algo pra anotar ou lembrar depois, é só dizer.`,
];

const TASK_TEMPLATES: Array<(title: string) => string> = [
  (title) => `Deu pra fazer "${title}"?\nSe sim, me avisa que eu marco como feita. Se não, me diz pra quando eu remarco.`,
  (title) => `Sobre "${title}": rolou?\nÉ só falar que eu concluo, ou me dá uma nova data que eu remarco.`,
  (title) => `Passou da hora de "${title}".\nConseguiu? Me conta que eu marco como feita ou remarco pra você.`,
];

function seedFrom(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash;
}

/** Mesma tarefa/evento → mesma frase (reentrega não muda o texto), mas entre itens varia. */
export function formatCheckinMessage(candidate: CheckinCandidate): string {
  const templates = candidate.kind === 'event' ? EVENT_TEMPLATES : TASK_TEMPLATES;
  return templates[seedFrom(candidate.ref) % templates.length]!(candidate.title);
}
