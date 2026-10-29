import { humanHour } from '../digest/extras.js';
import { taskHourLabel } from '../digest/morning.js';

export type OverviewPeriod = 'today' | 'tomorrow' | 'week';

export interface OverviewEvent {
  title: string;
  startIso: string;
  endIso: string;
}
export interface OverviewTask {
  id: string;
  title: string;
  dueIso: string | null;
}
export interface OverviewReminder {
  message: string;
  atIso: string;
}
export interface OverviewFreeWindow {
  startIso: string;
  endIso: string;
  minutes: number;
}

export interface DayOverviewData {
  period: OverviewPeriod;
  timeZone: string;
  /** Instante de referência (testes). */
  nowIso: string;
  calendarConnected: boolean;
  events: OverviewEvent[];
  tasksDue: OverviewTask[];
  reminders: OverviewReminder[];
  /** Pendentes com prazo antes do período (só "hoje"). */
  overdue: OverviewTask[];
  undated: OverviewTask[];
  undatedMore: boolean;
  /** Hábitos ativos ainda não marcados hoje (só "hoje"). */
  habitsPending: string[];
  freeWindows: OverviewFreeWindow[];
  /** Fontes que falharam ("agenda", "tarefas"...) — o texto avisa em vez de afirmar "dia livre". */
  failedSources: string[];
}

function isAllDay(iso: string): boolean {
  return !iso.includes('T');
}

function localDateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function dayHeader(dateKey: string, timeZone: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(date);
  const [, month, day] = dateKey.split('-');
  return `*${weekday} (${day}/${month})*`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

function eventLine(event: OverviewEvent, timeZone: string): string {
  if (isAllDay(event.startIso)) return `• o dia todo: ${event.title}`;
  const start = humanHour(event.startIso, timeZone);
  const hasEnd = event.endIso && event.endIso.includes('T') && event.endIso !== event.startIso;
  return hasEnd ? `• ${start} às ${humanHour(event.endIso, timeZone)}: ${event.title}` : `• ${start}: ${event.title}`;
}

function taskLine(task: OverviewTask, timeZone: string): string {
  const hour = task.dueIso ? taskHourLabel(task.dueIso, timeZone) : null;
  return hour ? `• ${humanHour(task.dueIso!, timeZone)}: ${task.title}` : `• ${task.title}`;
}

function reminderLine(reminder: OverviewReminder, timeZone: string): string {
  return `• ${humanHour(reminder.atIso, timeZone)}: ${reminder.message}`;
}

const SOURCE_LABELS: Record<string, string> = { agenda: 'a agenda', tarefas: 'as tarefas', lembretes: 'os lembretes', habitos: 'os hábitos' };

function failureNote(failed: string[]): string | null {
  if (failed.length === 0) return null;
  const labels = failed.map((source) => SOURCE_LABELS[source] ?? source);
  return `Não consegui ver ${labels.join(' e ')} agora, então pode faltar coisa aí em cima.`;
}

/** Ordem cronológica de itens com hora (eventos, tarefas com hora, lembretes) + tarefas sem hora no fim. */
function buildAgendaLines(data: DayOverviewData, dateKey?: string): string[] {
  const inDay = (iso: string) => !dateKey || localDateKey(iso, data.timeZone) === dateKey || (isAllDay(iso) && iso.slice(0, 10) === dateKey);

  const timed: Array<{ at: number; line: string }> = [];
  const untimed: string[] = [];
  for (const event of data.events.filter((e) => inDay(e.startIso))) {
    timed.push({ at: isAllDay(event.startIso) ? -1 : new Date(event.startIso).getTime(), line: eventLine(event, data.timeZone) });
  }
  for (const task of data.tasksDue.filter((t) => t.dueIso && inDay(t.dueIso))) {
    if (task.dueIso && taskHourLabel(task.dueIso, data.timeZone)) timed.push({ at: new Date(task.dueIso).getTime(), line: taskLine(task, data.timeZone) });
    else untimed.push(taskLine(task, data.timeZone));
  }
  for (const reminder of data.reminders.filter((r) => inDay(r.atIso))) {
    timed.push({ at: new Date(reminder.atIso).getTime(), line: reminderLine(reminder, data.timeZone) });
  }
  timed.sort((a, b) => a.at - b.at);
  return [...timed.map((item) => item.line), ...untimed];
}

function freeWindowsLine(windows: OverviewFreeWindow[], timeZone: string): string | null {
  if (windows.length === 0) return null;
  const parts = windows.slice(0, 4).map((w) => `${humanHour(w.startIso, timeZone)} às ${humanHour(w.endIso, timeZone)} (${formatDuration(w.minutes)})`);
  return `Horários livres: ${parts.join(', ')}.`;
}

function formatSingleDay(data: DayOverviewData): string {
  const label = data.period === 'today' ? 'hoje' : 'amanhã';
  const agendaLines = buildAgendaLines(data);
  const failure = failureNote(data.failedSources);

  const groupA: string[] = [];
  if (agendaLines.length > 0) {
    groupA.push(`📅 *Seu dia ${label}*`, ...agendaLines);
  }

  const groupB: string[] = [];
  if (data.overdue.length > 0) {
    groupB.push('⏳ *Atrasadas*', ...data.overdue.slice(0, 5).map((task) => taskLine(task, data.timeZone)));
  }
  if (data.undated.length > 0) {
    groupB.push('📌 *Sem data*', ...data.undated.slice(0, 5).map((task) => `• ${task.title}`), ...(data.undatedMore ? ['• e mais algumas'] : []));
  }
  if (data.habitsPending.length > 0) {
    groupB.push('💪 *Hábitos de hoje ainda sem marcar*', ...data.habitsPending.slice(0, 5).map((habit) => `• ${habit}`));
  }

  // Nada pra listar: ou a fonte falhou (avisa) ou o dia está mesmo livre (só então afirma).
  if (groupA.length === 0 && groupB.length === 0) {
    if (failure) return failure;
    return data.calendarConnected
      ? `Seu dia ${label} está livre: nada na agenda, nenhuma tarefa ou lembrete marcado.`
      : `Pelo que tenho aqui (tarefas e lembretes), seu dia ${label} está livre.`;
  }

  const groupC: string[] = [];
  const free = freeWindowsLine(data.freeWindows, data.timeZone);
  if (free) groupC.push(free);
  if (failure) groupC.push(failure);

  return [groupA, groupB, groupC]
    .filter((group) => group.length > 0)
    .map((group) => group.join('\n'))
    .join('\n\n');
}

function formatWeek(data: DayOverviewData): string {
  const failure = failureNote(data.failedSources);
  const dateKeys = new Set<string>();
  const add = (iso: string | null) => {
    if (iso) dateKeys.add(isAllDay(iso) ? iso.slice(0, 10) : localDateKey(iso, data.timeZone));
  };
  data.events.forEach((event) => add(event.startIso));
  data.tasksDue.forEach((task) => add(task.dueIso));
  data.reminders.forEach((reminder) => add(reminder.atIso));

  const lines: string[] = [];
  for (const dateKey of [...dateKeys].sort()) {
    const dayLines = buildAgendaLines(data, dateKey);
    if (dayLines.length === 0) continue;
    if (lines.length > 0) lines.push('');
    lines.push(dayHeader(dateKey, data.timeZone), ...dayLines);
  }

  if (lines.length === 0) {
    if (failure) return failure;
    return data.calendarConnected
      ? 'Os próximos 7 dias estão livres: nada na agenda, nenhuma tarefa ou lembrete marcado.'
      : 'Pelo que tenho aqui (tarefas e lembretes), os próximos 7 dias estão livres.';
  }
  const head = '📅 *Seus próximos 7 dias*';
  // Uma mensagem só: linhas em branco entre dias virariam vários balões.
  return [head, ...lines.filter((line) => line !== ''), ...(failure ? [failure] : [])].join('\n');
}

/**
 * Texto do "hoje / amanhã / semana". Determinístico, sem LLM: o que está na
 * agenda, nas tarefas e nos lembretes, sem inventar nada. Fonte que falhou é
 * avisada — nunca se afirma "dia livre" sem ter conseguido olhar.
 */
export function formatDayOverview(data: DayOverviewData): string {
  return data.period === 'week' ? formatWeek(data) : formatSingleDay(data);
}
