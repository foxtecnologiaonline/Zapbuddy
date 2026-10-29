import { taskHourLabel } from '../digest/morning.js';
import { humanHour } from '../digest/extras.js';

export interface PendingTaskLine {
  title: string;
  dueIso: string | null;
}

const MAX_TASKS_SHOWN = 15;

function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function dueLabel(iso: string, timeZone: string, todayKey: string): string {
  const key = dayKey(iso, timeZone);
  const hour = taskHourLabel(iso, timeZone) ? humanHour(iso, timeZone) : null;
  const dayText = key === todayKey ? 'hoje' : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  return hour ? `${dayText}, ${hour}` : dayText;
}

/** Tarefas pendentes: atrasadas primeiro, depois por prazo, depois as sem data. */
export function formatPendingTasks(tasks: PendingTaskLine[], timeZone: string, now: Date = new Date()): string {
  if (tasks.length === 0) return 'Você não tem nenhuma tarefa pendente. Tudo em dia 🙂';

  const todayKey = dayKey(now.toISOString(), timeZone);
  const dated = tasks.filter((task) => task.dueIso).sort((a, b) => a.dueIso!.localeCompare(b.dueIso!));
  const undated = tasks.filter((task) => !task.dueIso);

  const overdue = dated.filter((task) => dayKey(task.dueIso!, timeZone) < todayKey);
  const upcoming = dated.filter((task) => dayKey(task.dueIso!, timeZone) >= todayKey);

  const lines: string[] = [];
  if (overdue.length > 0) {
    lines.push('⏳ *Atrasadas*', ...overdue.map((task) => `• ${task.title} (era ${dueLabel(task.dueIso!, timeZone, todayKey)})`));
  }
  if (upcoming.length > 0) {
    lines.push('📌 *Com prazo*', ...upcoming.map((task) => `• ${task.title} (${dueLabel(task.dueIso!, timeZone, todayKey)})`));
  }
  if (undated.length > 0) {
    lines.push('📝 *Sem data*', ...undated.map((task) => `• ${task.title}`));
  }

  // Corta no teto de linhas de tarefa (os títulos de seção não contam).
  let taskCount = 0;
  const shown: string[] = [];
  let hidden = 0;
  for (const line of lines) {
    if (line.startsWith('•')) {
      taskCount += 1;
      if (taskCount > MAX_TASKS_SHOWN) {
        hidden += 1;
        continue;
      }
    }
    shown.push(line);
  }
  if (hidden > 0) shown.push(`…e mais ${hidden}.`);
  return shown.join('\n');
}
