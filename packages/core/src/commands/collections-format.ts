import { formatBrl } from '../calc/format.js';
import { humanHour } from '../digest/extras.js';
import { datePartsInZone } from '../time/zoned-ranges.js';

/**
 * Atalhos de consulta (lembretes, notas, contas, metas, hábitos, datas): formatadores PUROS, sem LLM, sem rede e sem dado
 * inventado — cada linha vem de um registro que a própria pessoa criou. Quando não há nada, a resposta ensina em uma frase como
 * criar (a frase de exemplo é pra PESSOA dizer; o Tom não cria nada sozinho). No máximo 1 emoji por linha.
 */

const MAX_LINES = 12;

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1).trimEnd()}…` : oneLine;
}

function withOverflow(lines: string[], total: number): string[] {
  return total > lines.length ? [...lines, `…e mais ${total - lines.length}.`] : lines;
}

function dateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function shortDate(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Soma dias a uma chave YYYY-MM-DD (UTC, sem horário de verão no meio). */
function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------

export interface ReminderLine {
  message: string;
  remindAt: string;
  recurrence: 'daily' | 'weekly' | 'monthly' | null;
}

const RECURRENCE_LABEL = { daily: 'todo dia', weekly: 'toda semana', monthly: 'todo mês' } as const;

export function formatPendingReminders(reminders: ReminderLine[], timeZone: string, now: Date = new Date()): string {
  if (reminders.length === 0) {
    return 'Você não tem lembretes pendentes.\nPra criar um, é só dizer: "me lembra de ligar pro João amanhã às 9h".';
  }

  const todayKey = dateKey(now.toISOString(), timeZone);
  const tomorrowKey = addDays(todayKey, 1);
  const sorted = [...reminders].sort((a, b) => a.remindAt.localeCompare(b.remindAt));

  const lines = sorted.slice(0, MAX_LINES).map((reminder) => {
    const key = dateKey(reminder.remindAt, timeZone);
    const day = key === todayKey ? 'hoje' : key === tomorrowKey ? 'amanhã' : key < todayKey ? `era ${shortDate(key)}` : shortDate(key);
    const repeat = reminder.recurrence ? `, ${RECURRENCE_LABEL[reminder.recurrence]}` : '';
    return `• ${truncate(reminder.message, 70)} (${day}, ${humanHour(reminder.remindAt, timeZone)}${repeat})`;
  });
  return ['⏰ *Seus próximos lembretes*', ...withOverflow(lines, sorted.length)].join('\n');
}

// ---------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------

export interface NoteLine {
  content: string;
  createdAt: string;
}

const MAX_NOTES_SHOWN = 8;

export function formatRecentNotes(notes: NoteLine[], timeZone: string): string {
  if (notes.length === 0) return 'Você ainda não tem notas.\nÉ só dizer "anota: ..." que eu guardo.';

  const lines = notes.slice(0, MAX_NOTES_SHOWN).map((note) => `• ${shortDate(dateKey(note.createdAt, timeZone))} — ${truncate(note.content, 80)}`);
  return ['📝 *Suas últimas notas*', ...withOverflow(lines, notes.length), 'Pra achar uma específica, me diga o assunto: "nota sobre presente".'].join('\n');
}

// ---------------------------------------------------------------------------
// Contas recorrentes
// ---------------------------------------------------------------------------

export interface BillLine {
  name: string;
  amountCents: number;
  dueDay: number;
}

export function formatRecurringBills(bills: BillLine[]): string {
  if (bills.length === 0) {
    return 'Você não tem contas fixas guardadas.\nSe algo vence todo mês, é só dizer: "internet vence dia 10, R$ 99".';
  }

  const sorted = [...bills].sort((a, b) => a.dueDay - b.dueDay);
  const lines = sorted.slice(0, MAX_LINES).map((bill) => `• ${truncate(bill.name, 40)}: ${formatBrl(bill.amountCents)}, todo dia ${bill.dueDay}`);
  const total = sorted.reduce((sum, bill) => sum + bill.amountCents, 0);
  // A soma é conta de código sobre os valores que a pessoa informou — nunca estimativa.
  return ['🧾 *Suas contas fixas*', ...withOverflow(lines, sorted.length), `Somam ${formatBrl(total)} por mês (só o que você me contou).`].join('\n');
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export interface SavingsGoalLine {
  title: string;
  targetCents: number;
  savedCents: number;
  /** YYYY-MM-DD ou null. */
  deadline: string | null;
}

export interface GoalsOverviewInput {
  savings: SavingsGoalLine[];
  personal: string[];
}

function deadlineLabel(deadline: string): string {
  const [year, month, day] = deadline.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : deadline;
}

export function formatGoalsOverview({ savings, personal }: GoalsOverviewInput): string {
  if (savings.length === 0 && personal.length === 0) {
    return 'Você ainda não tem metas.\nPra uma meta com valor: "quero juntar R$ 2.000 até junho". Pra uma sem valor: "quero ler mais".';
  }

  const blocks: string[] = [];
  if (savings.length > 0) {
    const lines = savings.slice(0, MAX_LINES).map((goal) => {
      const percent = goal.targetCents > 0 ? Math.min(100, Math.floor((goal.savedCents / goal.targetCents) * 100)) : 0;
      const until = goal.deadline ? `, até ${deadlineLabel(goal.deadline)}` : '';
      return `• ${truncate(goal.title, 40)}: ${formatBrl(goal.savedCents)} de ${formatBrl(goal.targetCents)} (${percent}%)${until}`;
    });
    blocks.push(['🎯 *Metas com valor*', ...withOverflow(lines, savings.length)].join('\n'));
  }
  if (personal.length > 0) {
    const lines = personal.slice(0, MAX_LINES).map((description) => `• ${truncate(description, 70)}`);
    blocks.push(['🌱 *Metas pessoais*', ...withOverflow(lines, personal.length)].join('\n'));
  }
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Hábitos
// ---------------------------------------------------------------------------

export interface HabitLine {
  name: string;
  doneToday: boolean;
  currentStreak: number;
  last7Days: number;
}

export function formatHabitsOverview(habits: HabitLine[]): string {
  if (habits.length === 0) {
    return 'Nenhum hábito por aqui ainda.\nDiga, por exemplo, "quero criar o hábito de caminhar" que eu acompanho a sequência.';
  }

  const lines = habits.slice(0, MAX_LINES).map((habit) => {
    const streak = habit.currentStreak === 1 ? '1 dia seguido' : `${habit.currentStreak} dias seguidos`;
    const today = habit.doneToday ? 'já marcou hoje' : 'falta marcar hoje';
    return `• ${truncate(habit.name, 40)}: ${streak}, ${today} (${habit.last7Days} dos últimos 7 dias)`;
  });
  const pending = habits.filter((habit) => !habit.doneToday).length;
  const closing = pending > 0 ? 'Fez algum? É só me dizer, tipo "fiz a caminhada".' : 'Tudo marcado hoje, bom trabalho!';
  return ['💪 *Seus hábitos*', ...withOverflow(lines, habits.length), closing].join('\n');
}

// ---------------------------------------------------------------------------
// Datas importantes
// ---------------------------------------------------------------------------

export interface ImportantDateLine {
  label: string;
  month: number;
  day: number;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dias até a próxima ocorrência (0 = hoje). 29/02 em ano comum cai em 28/02, nunca em 01/03. */
export function daysUntilNextOccurrence(month: number, day: number, timeZone: string, now: Date = new Date()): number {
  const today = datePartsInZone(timeZone, now);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);

  let year = today.year;
  let target = Date.UTC(year, month - 1, Math.min(day, lastDayOfMonth(year, month)));
  if (target < todayMs) {
    year += 1;
    target = Date.UTC(year, month - 1, Math.min(day, lastDayOfMonth(year, month)));
  }
  return Math.round((target - todayMs) / 86_400_000);
}

function inDaysLabel(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `daqui a ${days} dias`;
}

export function formatImportantDates(dates: ImportantDateLine[], timeZone: string, now: Date = new Date()): string {
  if (dates.length === 0) {
    return 'Você não tem datas importantes guardadas.\nDiga, por exemplo, "aniversário da minha mãe, 12 de março" que eu guardo e te aviso no dia.';
  }

  const sorted = dates
    .map((date) => ({ ...date, days: daysUntilNextOccurrence(date.month, date.day, timeZone, now) }))
    .sort((a, b) => a.days - b.days);
  const lines = sorted.slice(0, MAX_LINES).map((date) => `• ${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')} — ${truncate(date.label, 50)} (${inDaysLabel(date.days)})`);
  return ['🎂 *Suas datas importantes*', ...withOverflow(lines, sorted.length)].join('\n');
}
