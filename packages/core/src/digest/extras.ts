import { weatherEmoji } from './weather-tips.js';

/**
 * Informações extras do resumo matinal (2026-10, pedido do dono do produto):
 * contagem regressiva do próximo compromisso, datas importantes dos próximos
 * dias, retrato financeiro leve, hábitos/metas e prévia de amanhã. Tudo puro
 * (sem IO) e só com dado que a pessoa registrou — nada estimado nem inventado;
 * seção sem dado simplesmente não aparece.
 */

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "9h" ou "9h30" no fuso da pessoa — como se fala, não "09:00". */
export function humanHour(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return minute === '00' ? `${hour}h` : `${hour}h${minute}`;
}

// ---------------------------------------------------------------------------
// 1. Próximo compromisso + contagem regressiva
// ---------------------------------------------------------------------------

export function formatCountdown(minutes: number): string {
  if (minutes < 1) return 'daqui a poucos minutos';
  if (minutes < 60) return `daqui a ${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `daqui a ${hours}h` : `daqui a ${hours}h${String(rest).padStart(2, '0')}`;
}

/** Evento de dia inteiro vem só com a data (sem "T"): não tem hora pra contar. */
function isTimed(startIso: string): boolean {
  return startIso.includes('T');
}

export function nextEventCountdownLine(events: Array<{ startIso: string }>, timeZone: string, nowMs: number): string | null {
  const timed = events.filter((event) => isTimed(event.startIso));
  const next = timed.find((event) => new Date(event.startIso).getTime() >= nowMs);
  if (!next) return null;

  const alreadyHappened = timed.some((event) => new Date(event.startIso).getTime() < nowMs);
  const minutes = (new Date(next.startIso).getTime() - nowMs) / 60_000;
  const label = alreadyHappened ? 'O próximo compromisso' : 'Seu primeiro compromisso';
  return `⏰ ${label} é às ${humanHour(next.startIso, timeZone)}, ${formatCountdown(minutes)}.`;
}

// ---------------------------------------------------------------------------
// 2. Datas importantes: hoje + próximos 3 dias
// ---------------------------------------------------------------------------

export interface ImportantDateInput {
  id: string;
  label: string;
  month: number;
  day: number;
}

export interface UpcomingImportantDate {
  id: string;
  label: string;
  /** 0 = hoje, 1 = amanhã... */
  offsetDays: number;
  weekdayLabel: string;
}

export const IMPORTANT_DATES_WINDOW_DAYS = 3;

export function upcomingImportantDates(
  dates: ImportantDateInput[],
  todayYear: number,
  todayMonth: number,
  todayDay: number,
  windowDays: number = IMPORTANT_DATES_WINDOW_DAYS,
): UpcomingImportantDate[] {
  const result: UpcomingImportantDate[] = [];
  for (let offset = 0; offset <= windowDays; offset += 1) {
    // Meio-dia UTC: o dia do calendário não muda com fuso nem com virada de mês/ano.
    const date = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + offset, 12));
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const weekdayLabel = capitalize(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(date).replace('-feira', ''));
    for (const item of dates.filter((entry) => entry.month === month && entry.day === day)) {
      result.push({ id: item.id, label: item.label, offsetDays: offset, weekdayLabel });
    }
  }
  return result;
}

export function formatImportantDatesLine(items: UpcomingImportantDate[]): string | null {
  if (items.length === 0) return null;
  const parts = items.map((item) => {
    const when = item.offsetDays === 0 ? 'Hoje' : item.offsetDays === 1 ? 'Amanhã' : item.weekdayLabel;
    return `${when}: ${item.label}`;
  });
  return `🗓️ ${parts.join(' · ')}`;
}

// ---------------------------------------------------------------------------
// 3. Retrato financeiro leve
// ---------------------------------------------------------------------------

export interface BudgetStatus {
  category: string;
  limitCents: number;
  spentCents: number;
}

export interface FinanceSnapshotInput {
  yesterdayExpenseCents: number;
  /** Do dia 1 até ontem; null no dia 1 (nenhum dia fechado no mês). */
  monthExpenseCents: number | null;
  /** Mesmo trecho do mês anterior; null quando não há base de comparação. */
  previousMonthExpenseCents: number | null;
  budgets: BudgetStatus[];
}

/** A partir de quanto do limite a categoria entra no aviso. */
export const BUDGET_WARNING_RATIO = 0.8;
const MAX_BUDGET_LINES = 3;

function categoryLabel(category: string): string {
  return capitalize(category.replace(/_/g, ' '));
}

/**
 * Só fatos do que a pessoa registrou: gasto de ontem (omitido quando zero —
 * "zero" costuma ser "não registrei", não "não gastei"), mês até ontem com
 * comparação só quando os dois trechos têm gasto, e limites que ELA mesma
 * configurou (set_budget_alert) quando passam de 80%. Sem julgamento.
 */
export function formatFinanceSnapshot(input: FinanceSnapshotInput): string | null {
  const lines: string[] = [];

  if (input.yesterdayExpenseCents > 0) {
    lines.push(`• Ontem: ${formatBRL(input.yesterdayExpenseCents)} em gastos`);
  }

  if (input.monthExpenseCents !== null && input.monthExpenseCents > 0) {
    let line = `• No mês, até ontem: ${formatBRL(input.monthExpenseCents)}`;
    if (input.previousMonthExpenseCents !== null && input.previousMonthExpenseCents > 0) {
      const diff = Math.round(((input.monthExpenseCents - input.previousMonthExpenseCents) / input.previousMonthExpenseCents) * 100);
      line += diff === 0 ? ' — igual ao mesmo período do mês passado' : ` — ${Math.abs(diff)}% ${diff > 0 ? 'acima' : 'abaixo'} do mesmo período do mês passado`;
    }
    lines.push(line);
  }

  const nearLimit = input.budgets
    .filter((budget) => budget.limitCents > 0 && budget.spentCents / budget.limitCents >= BUDGET_WARNING_RATIO)
    .sort((a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents)
    .slice(0, MAX_BUDGET_LINES);
  for (const budget of nearLimit) {
    const amounts = `${formatBRL(budget.spentCents)} de ${formatBRL(budget.limitCents)}`;
    lines.push(
      budget.spentCents >= budget.limitCents
        ? `• ⚠️ ${categoryLabel(budget.category)} passou do limite do mês (${amounts})`
        : `• ⚠️ ${categoryLabel(budget.category)} está em ${Math.floor((budget.spentCents / budget.limitCents) * 100)}% do limite (${amounts})`,
    );
  }

  return lines.length === 0 ? null : `💰 *Seu dinheiro*\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// 4. Hábitos e metas
// ---------------------------------------------------------------------------

export interface HabitLine {
  name: string;
  currentStreak: number;
  doneToday: boolean;
}

export interface GoalDeadlineLine {
  title: string;
  savedCents: number;
  targetCents: number;
  daysLeft: number;
}

/** Meta com valor entra quando o prazo (declarado pela pessoa) está a até esse tanto de dias. */
export const GOAL_DEADLINE_WINDOW_DAYS = 14;
const MAX_HABIT_LINES = 3;
const MAX_GOAL_LINES = 2;

function describeDaysLeft(days: number): string {
  if (days === 0) return 'é hoje';
  if (days === 1) return 'é amanhã';
  return `em ${days} dias`;
}

export function formatHabitsAndGoals(habits: HabitLine[], goals: GoalDeadlineLine[]): string | null {
  const lines: string[] = [];

  const topHabits = [...habits].sort((a, b) => b.currentStreak - a.currentStreak).slice(0, MAX_HABIT_LINES);
  for (const habit of topHabits) {
    const streak = habit.currentStreak;
    const days = `${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}`;
    if (streak === 0) {
      lines.push(`• ${habit.name}: sem sequência por enquanto — hoje é um bom dia pra começar`);
    } else if (habit.doneToday) {
      lines.push(`• ${habit.name}: ${days}${streak >= 2 ? ' 🔥' : ''} (hoje já marcado ✅)`);
    } else {
      lines.push(`• ${habit.name}: ${days}${streak >= 2 ? ' 🔥' : ''} — hoje ainda falta marcar`);
    }
  }

  const dueGoals = goals
    .filter((goal) => goal.daysLeft >= 0 && goal.daysLeft <= GOAL_DEADLINE_WINDOW_DAYS && goal.targetCents > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, MAX_GOAL_LINES);
  for (const goal of dueGoals) {
    const percent = Math.min(100, Math.floor((goal.savedCents / goal.targetCents) * 100));
    lines.push(`• Meta ${goal.title}: ${percent}% (${formatBRL(goal.savedCents)} de ${formatBRL(goal.targetCents)}) — prazo ${describeDaysLeft(goal.daysLeft)}`);
  }

  if (lines.length === 0) return null;
  const nudge = topHabits.some((habit) => !habit.doneToday) ? '\nFez algum hoje? É só me avisar que eu marco 😉' : '';
  return `🎯 *Hábitos e metas*\n${lines.join('\n')}${nudge}`;
}

// ---------------------------------------------------------------------------
// 5. Prévia de amanhã
// ---------------------------------------------------------------------------

export interface TomorrowPreviewInput {
  events: Array<{ startIso: string; title: string }>;
  tasks: Array<{ title: string }>;
  weather: { minTempC: number; maxTempC: number; description: string; conditionId: number; rainChancePercent: number } | null;
}

export function formatTomorrowPreview(input: TomorrowPreviewInput, timeZone: string): string | null {
  const agendaParts: string[] = [];
  const events = [...input.events].sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

  if (events.length === 1) {
    const only = events[0]!;
    agendaParts.push(isTimed(only.startIso) ? `1 compromisso (${humanHour(only.startIso, timeZone)} — ${only.title})` : `1 compromisso (${only.title})`);
  } else if (events.length > 1) {
    const first = events.find((event) => isTimed(event.startIso));
    agendaParts.push(
      first
        ? `${events.length} compromissos (o primeiro às ${humanHour(first.startIso, timeZone)}: ${first.title})`
        : `${events.length} compromissos`,
    );
  }
  if (input.tasks.length > 0) {
    agendaParts.push(`${input.tasks.length} ${input.tasks.length === 1 ? 'tarefa' : 'tarefas'}`);
  }

  let weatherPart: string | null = null;
  if (input.weather) {
    const { minTempC, maxTempC, description, conditionId, rainChancePercent } = input.weather;
    weatherPart = `${weatherEmoji(conditionId)} ${minTempC}°C a ${maxTempC}°C, ${description}${rainChancePercent >= 40 ? ` (${rainChancePercent}% de chuva)` : ''}`;
  }

  // Sem agenda nem tarefa não dá pra afirmar "nada marcado" (a busca pode ter falhado): só mostra se houver algo a dizer.
  if (agendaParts.length === 0 && weatherPart === null) return null;
  const agenda = agendaParts.length > 0 ? agendaParts.join(' e ') : null;
  return `🔜 *Amanhã*: ${[agenda, weatherPart].filter((part): part is string => part !== null).join(' · ')}`;
}

// ---------------------------------------------------------------------------
// Mensagem de extras
// ---------------------------------------------------------------------------

export interface MorningExtrasData {
  importantDates: UpcomingImportantDate[];
  finance: FinanceSnapshotInput | null;
  habits: HabitLine[];
  goals: GoalDeadlineLine[];
  tomorrow: TomorrowPreviewInput | null;
}

/** Uma mensagem só com as seções que têm conteúdo; null quando nenhuma tem (nada de mensagem vazia). */
export function formatMorningExtras(extras: MorningExtrasData, timeZone: string): string | null {
  const sections = [
    formatImportantDatesLine(extras.importantDates),
    extras.finance ? formatFinanceSnapshot(extras.finance) : null,
    formatHabitsAndGoals(extras.habits, extras.goals),
    extras.tomorrow ? formatTomorrowPreview(extras.tomorrow, timeZone) : null,
  ].filter((section): section is string => section !== null);

  return sections.length === 0 ? null : sections.join('\n\n');
}
