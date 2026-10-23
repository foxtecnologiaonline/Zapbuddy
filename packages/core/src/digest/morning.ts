import type { Estacao } from './season.js';
import type { HolidayToday } from './holidays.js';
import type { TodayWeatherSummary } from '../weather/openweathermap.js';
import { buildWeatherTips, weatherEmoji } from './weather-tips.js';

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
 * atual (mensagem financeira do resumo matinal, "compromissos do dia").
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

/** Dia da semana, data e índice (0=domingo) no fuso da pessoa — rótulos pt-BR pra narrativa. */
export function buildDateLabels(timeZone: string, referenceDate: Date): { weekdayLabel: string; dateLabel: string; weekdayIndex: number } {
  const weekdayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone }).format(referenceDate);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone }).format(referenceDate);
  const weekdayEnglish = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(referenceDate);
  const weekdayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(weekdayEnglish);
  return { weekdayLabel, dateLabel, weekdayIndex };
}

function hourLabelInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Horário da tarefa só quando é um horário de verdade: 00:00 e 23:59 costumam ser "o dia todo", não uma hora marcada. */
export function taskHourLabel(dueAtIso: string, timeZone: string): string | null {
  const label = hourLabelInZone(dueAtIso, timeZone);
  return label === '00:00' || label === '23:59' ? null : label;
}

// ---------------------------------------------------------------------------
// Narrativa (1ª mensagem)
// ---------------------------------------------------------------------------

export interface MorningNarrativeInput {
  /** preferred_name ou primeiro nome; null = saudação sem nome. */
  name: string | null;
  /** Hora local em que o resumo está sendo enviado — decide bom dia/boa tarde/boa noite. */
  digestHour: number;
  month: number;
  day: number;
  weekdayIndex: number;
  weekdayLabel: string;
  dateLabel: string;
  season: Estacao;
  weather: TodayWeatherSummary | null;
  holiday: HolidayToday | null;
  /** true só quando agenda, tarefas e contas (seções ligadas) estão todas vazias — vira a linha de "dia livre". */
  nothingScheduled: boolean;
  /** true quando vai haver mensagem(ns) depois desta — fecha a narrativa com o "já te mando…". */
  followUpComing: boolean;
}

const SEASON_PHRASE: Record<Estacao, string> = {
  verão: 'já estamos em pleno verão por aqui',
  outono: 'já estamos no outono por aqui',
  inverno: 'já estamos em pleno inverno por aqui',
  primavera: 'já estamos na primavera por aqui',
};

const SEASON_EMOJI: Record<Estacao, string> = { verão: '☀️', outono: '🍂', inverno: '🧣', primavera: '🌸' };

// Abertura por dia da semana (0=domingo). Vazio = sem frase extra.
const WEEKDAY_OPENERS: Record<number, string[]> = {
  0: ['Domingo de descanso!', 'Domingão!'],
  1: ['Começo de semana!', 'Segunda-feira chegou.'],
  3: ['Meio da semana, seguimos.'],
  5: ['Sextou!', 'Chegamos na sexta.'],
  6: ['Sábado!', 'Fim de semana!'],
};

const FREE_DAY_LINES = [
  'Não tenho nada registrado pra hoje — se quiser marcar algo, é só me falar.',
  'Por enquanto seu dia está livre. Me chama se quiser encaixar alguma coisa.',
];
const FOLLOW_UP_LINES = ['Já te mando o que tem pra hoje 👇', 'Olha o que tem pra hoje 👇'];

/** Variação determinística (mesmo dia → mesma frase, então retry de job não muda o texto). */
function pickVariant<T>(options: T[], month: number, day: number): T {
  return options[(month * 31 + day) % options.length]!;
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * 1ª mensagem: narrativa em parágrafos curtos (cumprimento com nome, dia/data/
 * estação, previsão com dicas, feriado). Sempre enviada. Clima e feriado são
 * omitidos (não inventados) quando não há dado. Formatação do WhatsApp: *negrito*.
 */
export function formatMorningNarrative(input: MorningNarrativeInput): string {
  const headerEmoji = input.weather ? weatherEmoji(input.weather.conditionId) : SEASON_EMOJI[input.season];
  // Nome vem da pessoa: tira os caracteres de formatação do WhatsApp pra "*Ana*" não quebrar o negrito do cumprimento.
  const safeName = input.name?.replace(/[*_~`]/g, '').trim() ?? '';
  const greeting = `${greetingForHour(input.digestHour)}${safeName ? `, ${safeName}` : ''}!`;
  const paragraphs: string[] = [`${headerEmoji} *${greeting}*`];

  const openerOptions = WEEKDAY_OPENERS[input.weekdayIndex];
  const opener = openerOptions ? `${pickVariant(openerOptions, input.month, input.day)} ` : '';
  paragraphs.push(`${opener}Hoje é *${input.weekdayLabel}, ${input.dateLabel}* — ${SEASON_PHRASE[input.season]}.`);

  if (input.weather) {
    const { minTempC, maxTempC, description } = input.weather;
    const forecast = `${weatherEmoji(input.weather.conditionId)} A previsão é de ${minTempC}°C a ${maxTempC}°C, com ${description}.`;
    paragraphs.push([forecast, ...buildWeatherTips(input.weather)].join(' '));
  }

  if (input.holiday) {
    if (input.holiday.official) {
      const scopeLabel = input.holiday.scope === 'nacional' ? 'feriado nacional' : 'feriado por aqui';
      paragraphs.push(`🎉 E hoje também é ${scopeLabel}: *${input.holiday.name}* — se puder, aproveite o dia de folga!`);
    } else {
      paragraphs.push(`🎉 Hoje também é *${input.holiday.name}* — ponto facultativo em boa parte do país.`);
    }
  }

  if (input.nothingScheduled) {
    paragraphs.push(pickVariant(FREE_DAY_LINES, input.month, input.day));
  } else if (input.followUpComing) {
    paragraphs.push(pickVariant(FOLLOW_UP_LINES, input.month, input.day));
  }

  return paragraphs.join('\n\n');
}

// ---------------------------------------------------------------------------
// Agenda + tarefas e financeiro (2ª e 3ª mensagens)
// ---------------------------------------------------------------------------

export interface MorningAgendaEvent {
  startIso: string;
  title: string;
}

export interface MorningTask {
  title: string;
  /** ISO do vencimento, quando houver — mostra a hora só se for uma hora de verdade (ver taskHourLabel). */
  dueAtIso: string | null;
}

function formatAgendaBlock(events: MorningAgendaEvent[], tasks: MorningTask[], timeZone: string, nowMs: number): string | null {
  const sections: string[] = [];

  if (events.length > 0) {
    const nextIndex = events.findIndex((event) => new Date(event.startIso).getTime() >= nowMs);
    const lines = events.map((event, index) => {
      const hour = hourLabelInZone(event.startIso, timeZone);
      return index === nextIndex ? `👉 *${hour}* ${event.title}` : `• ${hour} ${event.title}`;
    });
    sections.push(`📅 *Compromissos de hoje*\n${lines.join('\n')}`);
  }

  if (tasks.length > 0) {
    const lines = tasks.map((task) => {
      const hour = task.dueAtIso ? taskHourLabel(task.dueAtIso, timeZone) : null;
      return hour ? `• ${hour} ${task.title}` : `• ${task.title}`;
    });
    sections.push(`✅ *Tarefas de hoje*\n${lines.join('\n')}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}

function formatFinanceBlock(bills: UpcomingBill[]): string | null {
  if (bills.length === 0) return null;
  const lines = bills.map((bill) => `• ${bill.name} — ${formatBRL(bill.amountCents)}`);
  return `💸 *Compromissos financeiros de hoje*\n${lines.join('\n')}`;
}

const REMINDER_CTA = 'Quer que eu te lembre de algum deles? É só me dizer 😉';
const PAYMENT_CTA = 'Já pagou alguma? Me avisa que eu registro 😉';
const COMBINED_CTA = 'Quer que eu te lembre de algo ou registre um pagamento? É só me dizer 😉';

/** Junta 1 compromisso/tarefa + 1 conta numa mensagem só (2 notificações seguidas por 2 linhas é ruído). */
const MERGE_MAX_ITEMS = 2;

export interface MorningDigestData {
  name: string | null;
  timezone: string;
  digestHour: number;
  nowMs: number;
  month: number;
  day: number;
  season: Estacao;
  weather: TodayWeatherSummary | null;
  holiday: HolidayToday | null;
  agendaEvents: MorningAgendaEvent[];
  tasks: MorningTask[];
  bills: UpcomingBill[];
  /** Seções que a pessoa deixou ligadas — desligada = não buscou nada e não conta pra "dia livre". */
  includeAgenda: boolean;
  includeFinance: boolean;
  /**
   * false quando alguma fonte de agenda/tarefas/contas falhou ao buscar: vazio
   * ali não significa "nada hoje", então a narrativa não afirma "dia livre".
   */
  dataComplete: boolean;
}

/**
 * Monta as mensagens do resumo matinal, na ordem de envio: [narrativa,
 * agenda+tarefas?, financeiro?]. A narrativa sempre existe; as outras só com
 * conteúdo. Quando agenda/tarefas e financeiro têm no total até 2 itens,
 * viram uma mensagem só.
 */
export function composeMorningDigest(data: MorningDigestData): string[] {
  const agendaBlock = data.includeAgenda
    ? formatAgendaBlock(data.agendaEvents, data.tasks, data.timezone, data.nowMs)
    : null;
  const financeBlock = data.includeFinance ? formatFinanceBlock(data.bills) : null;

  const agendaItems = data.includeAgenda ? data.agendaEvents.length + data.tasks.length : 0;
  const financeItems = data.includeFinance ? data.bills.length : 0;
  const merge = agendaBlock !== null && financeBlock !== null && agendaItems + financeItems <= MERGE_MAX_ITEMS;

  const followUps: string[] = [];
  if (merge) {
    followUps.push(`${agendaBlock}\n\n${financeBlock}\n\n${COMBINED_CTA}`);
  } else {
    if (agendaBlock !== null) followUps.push(`${agendaBlock}\n\n${REMINDER_CTA}`);
    if (financeBlock !== null) followUps.push(`${financeBlock}\n\n${PAYMENT_CTA}`);
  }

  const { weekdayLabel, dateLabel, weekdayIndex } = buildDateLabels(data.timezone, new Date(data.nowMs));
  const narrative = formatMorningNarrative({
    name: data.name,
    digestHour: data.digestHour,
    month: data.month,
    day: data.day,
    weekdayIndex,
    weekdayLabel,
    dateLabel,
    season: data.season,
    weather: data.weather,
    holiday: data.holiday,
    nothingScheduled: data.dataComplete && data.includeAgenda && data.includeFinance && followUps.length === 0,
    followUpComing: followUps.length > 0,
  });

  return [narrative, ...followUps];
}

/**
 * Dias de atraso de uma tarefa (1 = venceu ontem) entre duas datas locais
 * quaisquer — mesma mecânica de `daysUntilDueDay`, mas sem "próximo mês"
 * (due_at já passou).
 */
export function daysOverdue(dueYear: number, dueMonth: number, dueDay: number, todayYear: number, todayMonth: number, todayDay: number): number {
  const due = Date.UTC(dueYear, dueMonth - 1, dueDay);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((today - due) / 86_400_000);
}

export interface OverdueTaskFollowUp {
  title: string;
  daysOverdue: number;
}

function describeOverdue(days: number): string {
  return days <= 1 ? 'era pra ontem' : `era pra ${days} dias atrás`;
}

/**
 * Pergunta de conclusão (migration 0022, pedido do usuário em produção): tarefa
 * pendente com prazo vencido nunca era confirmada — a pessoa nunca era
 * perguntada se de fato aconteceu. Uma mensagem só, só com o que ainda não foi
 * perguntado; null quando não há nada (sem mensagem vazia).
 */
export function formatTaskFollowUpMessage(tasks: OverdueTaskFollowUp[]): string | null {
  if (tasks.length === 0) return null;
  const lines = tasks.map((task) => `• ${task.title} (${describeOverdue(task.daysOverdue)})`);
  const ask = tasks.length === 1 ? 'Já rolou? Me conta que eu atualizo, ou me diz pra quando você quer remarcar.' : 'Alguma dessas já rolou? Me conta que eu atualizo, ou me diz pra quando você quer remarcar.';
  return `❓ *Preciso confirmar com você*\n${lines.join('\n')}\n\n${ask}`;
}
