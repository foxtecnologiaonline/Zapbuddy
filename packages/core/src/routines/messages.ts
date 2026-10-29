import { formatBrl } from '../calc/format.js';
import { percentChange } from '../calc/finance.js';

/** Fechamento do dia e revisão da semana (sugestão #11): formatadores puros, sem LLM e sem dado inventado. */

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function titleList(titles: string[], max = 3): string {
  const shown = titles.slice(0, max).join(', ');
  return titles.length > max ? `${shown} e mais ${titles.length - max}` : shown;
}

export interface DayCloseData {
  name: string | null;
  completedTitles: string[];
  spendCents: number;
  spendCount: number;
  /** Pendentes com prazo até o fim de hoje (inclui atrasadas). */
  pendingTitles: string[];
  habitsMissing: string[];
  /** Resposta de formatDayOverview('tomorrow'); null quando não deu pra montar. */
  tomorrowText: string | null;
}

export function formatDayClose(data: DayCloseData): string {
  const head = data.name ? `🌙 *Fechando o dia, ${data.name}*` : '🌙 *Fechando o seu dia*';
  const lines = [head];

  if (data.completedTitles.length > 0) {
    lines.push(`✅ Você concluiu ${data.completedTitles.length} ${plural(data.completedTitles.length, 'tarefa', 'tarefas')}: ${titleList(data.completedTitles)}`);
  }
  if (data.spendCount > 0) {
    lines.push(`💸 Gastos de hoje: ${formatBrl(data.spendCents)} em ${data.spendCount} ${plural(data.spendCount, 'lançamento', 'lançamentos')}`);
  }
  if (data.habitsMissing.length > 0) {
    lines.push(`💪 Hábitos ainda sem marcar: ${titleList(data.habitsMissing)}`);
  }
  if (data.pendingTitles.length > 0) {
    lines.push(`⏳ Ficaram pendentes: ${data.pendingTitles.length} ${plural(data.pendingTitles.length, 'tarefa', 'tarefas')} (${titleList(data.pendingTitles)})`);
  }
  if (lines.length === 1) lines.push('Dia tranquilo por aqui, nada registrado.');

  const closing = data.pendingTitles.length > 0 ? 'Quer que eu remarque o que ficou pendente pra amanhã?' : 'Descansa bem 😴 Amanhã a gente continua.';
  const bubbles = [lines.join('\n')];
  if (data.tomorrowText) {
    // Sem linhas em branco aqui dentro: cada uma viraria um balão a mais.
    bubbles.push(data.tomorrowText.replace(/\n\s*\n/g, '\n'));
  }
  bubbles.push(closing);
  return bubbles.join('\n\n');
}

export interface WeekReviewData {
  name: string | null;
  completedCount: number;
  spendCents: number;
  prevSpendCents: number;
  habitCheckins: number;
  pendingCount: number;
  overdueCount: number;
  nextWeekEvents: number;
  nextWeekTasks: number;
}

export function formatWeekReview(data: WeekReviewData): string {
  const lines = [data.name ? `🗓️ *Sua semana, ${data.name}*` : '🗓️ *Sua semana em resumo*'];

  lines.push(`✅ Tarefas concluídas: ${data.completedCount}`);
  if (data.spendCents > 0) {
    // Variação só quando as duas semanas têm gasto — semana anterior em branco costuma ser "não registrei".
    const change = data.prevSpendCents > 0 ? percentChange(data.prevSpendCents, data.spendCents) : null;
    const compare = change === null ? '' : change === 0 ? ' (igual à semana anterior)' : ` (${change > 0 ? '+' : ''}${change.toLocaleString('pt-BR')}% vs. semana anterior)`;
    lines.push(`💸 Gastos: ${formatBrl(data.spendCents)}${compare}`);
  }
  if (data.habitCheckins > 0) lines.push(`💪 Hábitos marcados: ${data.habitCheckins} ${plural(data.habitCheckins, 'vez', 'vezes')}`);

  const ahead: string[] = [];
  if (data.nextWeekEvents > 0) ahead.push(`${data.nextWeekEvents} ${plural(data.nextWeekEvents, 'compromisso', 'compromissos')}`);
  if (data.nextWeekTasks > 0) ahead.push(`${data.nextWeekTasks} ${plural(data.nextWeekTasks, 'tarefa com prazo', 'tarefas com prazo')}`);
  const second: string[] = [];
  second.push(ahead.length > 0 ? `📅 Pela frente na semana que vem: ${ahead.join(' e ')}` : '📅 A semana que vem ainda está livre.');
  if (data.overdueCount > 0) second.push(`⏳ Atrasadas: ${data.overdueCount}`);
  else if (data.pendingCount > 0) second.push(`📌 Pendentes: ${data.pendingCount}`);
  second.push('Quer que eu monte um plano pra segunda?');

  return `${lines.join('\n')}\n\n${second.join('\n')}`;
}
