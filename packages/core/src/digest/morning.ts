export interface UpcomingBill {
  name: string;
  amountCents: number;
  dueDay: number;
}

export interface OverdueTaskFollowUp {
  title: string;
  daysOverdue: number;
}

export interface MorningDigestInput {
  agendaLines: string[];
  taskTitles: string[];
  /** Tarefas atrasadas cuja pergunta de conclusão ainda não foi feita (ver migration 0022). */
  followUpTasks: OverdueTaskFollowUp[];
  bills: Array<UpcomingBill & { daysUntilDue: number }>;
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
 * Dias de atraso de uma tarefa (1 = venceu ontem). Mesma mecânica de
 * `daysUntilDueDay`, só que entre duas datas quaisquer (due_at já passado
 * não tem "próximo mês" pra calcular) — usada pelo resumo matinal pra saber
 * há quanto tempo uma tarefa pendente está parada antes de perguntar.
 */
export function daysOverdue(dueYear: number, dueMonth: number, dueDay: number, todayYear: number, todayMonth: number, todayDay: number): number {
  const due = Date.UTC(dueYear, dueMonth - 1, dueDay);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((today - due) / 86_400_000);
}

export const BILL_ALERT_WINDOW_DAYS = 3;

/** Contas com vencimento dentro da janela de aviso, já com a contagem de dias. */
export function billsDueWithin(
  bills: UpcomingBill[],
  todayYear: number,
  todayMonth: number,
  todayDay: number,
  windowDays: number = BILL_ALERT_WINDOW_DAYS,
): Array<UpcomingBill & { daysUntilDue: number }> {
  return bills
    .map((bill) => ({ ...bill, daysUntilDue: daysUntilDueDay(bill.dueDay, todayYear, todayMonth, todayDay) }))
    .filter((bill) => bill.daysUntilDue <= windowDays)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

function describeDue(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'vence hoje';
  if (daysUntilDue === 1) return 'vence amanhã';
  return `vence em ${daysUntilDue} dias`;
}

function describeOverdue(daysOverdueCount: number): string {
  if (daysOverdueCount === 1) return 'era pra ontem';
  return `está atrasada há ${daysOverdueCount} dias`;
}

// Mais de uma abertura de propósito (mesmo raciocínio de messages.ts): o
// resumo chega todo dia às 8h, sempre idêntico palavra por palavra viraria
// ruído que a pessoa aprende a ignorar.
const GREETINGS = [
  'Bom dia! Aqui está o seu dia:',
  'Bom dia! ☀️ Olha como o seu dia está:',
  'Bom dia! Separei o que importa pra hoje:',
  'Bom dia! Dá uma olhada no que te espera hoje:',
];

function pickGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!;
}

/**
 * Resumo matinal: uma mensagem só, com o que existe pra hoje. Devolve null
 * quando não há nada — não manda mensagem vazia (proatividade sem ruído).
 */
export function formatMorningDigest(input: MorningDigestInput): string | null {
  const sections: string[] = [];

  if (input.agendaLines.length > 0) {
    sections.push(`📅 Agenda de hoje:\n${input.agendaLines.map((line) => `• ${line}`).join('\n')}`);
  }
  if (input.taskTitles.length > 0) {
    sections.push(`✅ Tarefas de hoje e atrasadas:\n${input.taskTitles.map((title) => `• ${title}`).join('\n')}`);
  }
  if (input.followUpTasks.length > 0) {
    const lines = input.followUpTasks.map(
      (task) => `• ${task.title} (${describeOverdue(task.daysOverdue)}) — já aconteceu? me conta que eu atualizo`,
    );
    sections.push(`❓ Preciso confirmar com você:\n${lines.join('\n')}`);
  }
  if (input.bills.length > 0) {
    const lines = input.bills.map(
      (bill) => `• ${bill.name} (${formatBRL(bill.amountCents)}) ${describeDue(bill.daysUntilDue)}`,
    );
    sections.push(`💸 Contas a vencer:\n${lines.join('\n')}`);
  }

  if (sections.length === 0) return null;
  return `${pickGreeting()}\n\n${sections.join('\n\n')}`;
}
