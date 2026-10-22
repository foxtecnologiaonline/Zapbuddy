import type { Estacao } from './season.js';
import type { HolidayToday } from './holidays.js';
import type { TodayWeatherSummary } from '../weather/openweathermap.js';

export interface UpcomingBill {
  name: string;
  amountCents: number;
  dueDay: number;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Dias até o próximo vencimento (0 = hoje). `todayYear/Month/Day` é a data
 * local da pessoa (já resolvida pelo fuso). Vencimento em dia 31 num mês de
 * 30 dias cai no último dia do mês, não "pula" pro mês seguinte.
 */
export function daysUntilDueDay(dueDay: number, todayYear: number, todayMonth: number, todayDay: number): number {
  const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);

  const thisMonthDay = Math.min(dueDay, lastDayOfMonth(todayYear, todayMonth));
  const thisMonthDue = Date.UTC(todayYear, todayMonth - 1, thisMonthDay);
  if (thisMonthDue >= today) return Math.round((thisMonthDue - today) / 86_400_000);

  const nextMonth = todayMonth === 12 ? 1 : todayMonth + 1;
  const nextYear = todayMonth === 12 ? todayYear + 1 : todayYear;
  const nextMonthDay = Math.min(dueDay, lastDayOfMonth(nextYear, nextMonth));
  const nextMonthDue = Date.UTC(nextYear, nextMonth - 1, nextMonthDay);
  return Math.round((nextMonthDue - today) / 86_400_000);
}

/**
 * Contas com vencimento dentro da janela de aviso, já com a contagem de
 * dias. Default `windowDays: 0` = só as que vencem hoje — é o único uso
 * atual (3ª mensagem do resumo matinal, "compromissos financeiros do dia").
 */
export function billsDueWithin(
  bills: UpcomingBill[],
  todayYear: number,
  todayMonth: number,
  todayDay: number,
  windowDays: number = 0,
): Array<UpcomingBill & { daysUntilDue: number }> {
  return bills
    .map((bill) => ({ ...bill, daysUntilDue: daysUntilDueDay(bill.dueDay, todayYear, todayMonth, todayDay) }))
    .filter((bill) => bill.daysUntilDue <= windowDays)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export interface MorningNarrativeInput {
  weekdayLabel: string;
  dateLabel: string;
  season: Estacao;
  weather: TodayWeatherSummary | null;
  holiday: HolidayToday | null;
}

const SEASON_PHRASE: Record<Estacao, string> = {
  verão: 'já estamos em pleno verão por aqui',
  outono: 'já estamos no outono por aqui',
  inverno: 'já estamos em pleno inverno por aqui',
  primavera: 'já estamos na primavera por aqui',
};

/**
 * 1ª mensagem do resumo matinal: narrativa (dia da semana, data, estação,
 * previsão do tempo e feriado, se houver) — sempre enviada, nunca condicionada
 * a "ter algo pra mostrar" (diferente das mensagens 2 e 3, que são sobre
 * agenda/tarefas e contas do dia). Clima e feriado são omitidos da frase
 * (não inventados) quando não há dado — degradação graciosa de
 * `getTodayWeatherSummary`/`describeHolidayToday`.
 */
export function formatMorningNarrative(input: MorningNarrativeInput): string {
  const sentences: string[] = [`Bom dia! Hoje é ${input.weekdayLabel}, ${input.dateLabel} — ${SEASON_PHRASE[input.season]}.`];

  if (input.weather) {
    const { minTempC, maxTempC, description, rainExpected } = input.weather;
    const rainNote = rainExpected ? ' Vale levar um guarda-chuva.' : '';
    sentences.push(`A previsão pro dia é de ${minTempC}°C a ${maxTempC}°C, com ${description}.${rainNote}`);
  }

  if (input.holiday) {
    if (input.holiday.official) {
      const scopeLabel = input.holiday.scope === 'nacional' ? 'feriado nacional' : 'feriado por aqui';
      sentences.push(`E hoje também é ${scopeLabel}: ${input.holiday.name} — se puder, aproveite o dia de folga!`);
    } else {
      sentences.push(`Hoje também é ${input.holiday.name} — ponto facultativo em boa parte do país.`);
    }
  }

  return sentences.join(' ');
}

export interface TodayAgendaInput {
  agendaLines: string[];
  taskTitles: string[];
}

/**
 * 2ª mensagem: agenda (Google Agenda, se conectada) e tarefas com entrega
 * hoje — tarefa atrasada não entra aqui (decisão do dono do produto: resumo
 * matinal narrativo não lista atraso, só o que é de hoje). Null quando não
 * há nada, pra não mandar mensagem vazia.
 */
export function formatTodayAgendaMessage(input: TodayAgendaInput): string | null {
  const sections: string[] = [];

  if (input.agendaLines.length > 0) {
    sections.push(`📅 Compromissos de hoje:\n${input.agendaLines.map((line) => `• ${line}`).join('\n')}`);
  }
  if (input.taskTitles.length > 0) {
    sections.push(`✅ Tarefas de hoje:\n${input.taskTitles.map((title) => `• ${title}`).join('\n')}`);
  }

  if (sections.length === 0) return null;
  return sections.join('\n\n');
}

export interface TodayFinanceInput {
  bills: UpcomingBill[];
}

/** 3ª mensagem: contas recorrentes que vencem hoje. Null quando não há nenhuma. */
export function formatTodayFinanceMessage(input: TodayFinanceInput): string | null {
  if (input.bills.length === 0) return null;

  const lines = input.bills.map((bill) => `• ${bill.name} — ${formatBRL(bill.amountCents)}`);
  return `💸 Compromissos financeiros de hoje:\n${lines.join('\n')}`;
}
