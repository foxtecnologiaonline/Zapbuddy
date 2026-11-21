/**
 * Métricas do MVP (CLAUDE.md, "Métricas por fase"): "% de usuários com ≥1 mensagem/dia na semana 1" e
 * "tempo até a 1ª ação concluída". Lógica pura (sem IO), pra ser testável e pra deixar explícito O QUE
 * cada número significa — a mesma definição aparece na página `/admin/mvp`.
 *
 * Definições (fixas, pra o número de hoje ser comparável com o de daqui a um mês):
 * - **Dia N** de uma pessoa = a N-ésima janela de 24h desde o cadastro (`users.created_at`). Janela móvel em vez
 *   de dia do calendário: não depende de fuso e trata igual quem entrou às 8h e às 23h.
 * - **Mensagem** = evento aceito de texto, áudio ou documento no webhook (`webhook_events`). Rejeitado e
 *   "other" (reação, status) não contam: não são a pessoa falando com o Tom.
 * - **Coorte madura** = quem já completou os 7 dias. Quem ainda está na semana 1 fica de fora das métricas de
 *   retenção (senão puxaria o número pra baixo só por não ter tido tempo).
 * - **Ação** = a pessoa passou a ter um registro criado de verdade (tarefa, lembrete, nota, gasto, evento,
 *   data, meta, conta, hábito). Configurar preferência, guardar fato e onboarding não contam.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_DAYS = 7;

/** Tool calls que criam um registro da pessoa. `manage_list`/`manage_installments` ficam de fora: servem a vários usos, inclusive só leitura. */
export const ACTION_TOOL_NAMES = [
  'record_transaction',
  'create_task',
  'create_reminder',
  'create_note',
  'create_calendar_event',
  'remember_important_date',
  'create_goal',
  'create_personal_goal',
  'create_recurring_bill',
  'create_habit',
  'log_habit_checkin',
] as const;

export interface MvpUser {
  id: string;
  whatsappNumber: string;
  createdAt: string;
}

export interface MvpMetricsInput {
  users: MvpUser[];
  /** Horários (ISO) das mensagens aceitas, por número de WhatsApp. */
  messageTimesByNumber: Map<string, string[]>;
  /** Horário (ISO) da primeira ação bem-sucedida, por usuário. */
  firstActionAtByUser: Map<string, string>;
  now: Date;
}

export interface RetentionMetrics {
  /** Quem já completou os 7 dias. */
  matureCount: number;
  /** Quem ainda está na semana 1 (fora da conta). */
  inProgressCount: number;
  /** Média de dias distintos com mensagem nos 7 dias. */
  avgActiveDays: number | null;
  /** % que falou com o Tom em pelo menos 2 dias distintos (voltou). */
  pctReturned: number | null;
  /** % que falou em todos os 7 dias (leitura literal de "≥1 mensagem/dia na semana 1"). */
  pctEveryDay: number | null;
  /** % da coorte ativa em cada dia 0..6. */
  pctActiveByDay: Array<number | null>;
  /** Quantas pessoas tiveram 0..7 dias ativos. */
  activeDaysHistogram: number[];
}

export interface FirstActionMetrics {
  totalUsers: number;
  reachedCount: number;
  pctReached: number | null;
  medianMinutes: number | null;
  p90Minutes: number | null;
  /** Só entre quem tem ao menos 10 min de cadastro (quem acabou de entrar ainda não teve tempo). */
  pctWithin10Min: number | null;
  /** Só entre quem tem ao menos 24h de cadastro. */
  pctWithin24h: number | null;
}

export interface MvpMetrics {
  retention: RetentionMetrics;
  firstAction: FirstActionMetrics;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : (part / whole) * 100;
}

/** Percentil por interpolação linear; lista vazia = null. `p` em 0..1. */
export function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0]!;
  const position = (sortedValues.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}

/** Em qual janela de 24h (0..6) caiu a mensagem; null se fora da semana 1. Tolera 1 min de relógio antes do cadastro (o evento é gravado logo depois de criar o usuário). */
export function dayIndexOf(createdAtMs: number, messageAtMs: number): number | null {
  const diff = messageAtMs - createdAtMs;
  if (diff < -60_000) return null;
  const index = Math.max(0, Math.floor(diff / DAY_MS));
  return index < WEEK_DAYS ? index : null;
}

export function computeRetention(input: MvpMetricsInput): RetentionMetrics {
  const nowMs = input.now.getTime();
  const mature = input.users.filter((user) => new Date(user.createdAt).getTime() + WEEK_DAYS * DAY_MS <= nowMs);
  const activeByDay = new Array<number>(WEEK_DAYS).fill(0);
  const histogram = new Array<number>(WEEK_DAYS + 1).fill(0);
  let totalActiveDays = 0;

  for (const user of mature) {
    const createdMs = new Date(user.createdAt).getTime();
    const days = new Set<number>();
    for (const iso of input.messageTimesByNumber.get(user.whatsappNumber) ?? []) {
      const index = dayIndexOf(createdMs, new Date(iso).getTime());
      if (index !== null) days.add(index);
    }
    for (const day of days) activeByDay[day]! += 1;
    histogram[days.size]! += 1;
    totalActiveDays += days.size;
  }

  const matureCount = mature.length;
  const returned = histogram.slice(2).reduce((sum, count) => sum + count, 0);
  return {
    matureCount,
    inProgressCount: input.users.length - matureCount,
    avgActiveDays: matureCount === 0 ? null : totalActiveDays / matureCount,
    pctReturned: pct(returned, matureCount),
    pctEveryDay: pct(histogram[WEEK_DAYS]!, matureCount),
    pctActiveByDay: activeByDay.map((count) => pct(count, matureCount)),
    activeDaysHistogram: histogram,
  };
}

export function computeFirstAction(input: MvpMetricsInput): FirstActionMetrics {
  const nowMs = input.now.getTime();
  const minutes: number[] = [];
  let olderThan10 = 0;
  let within10 = 0;
  let olderThan24h = 0;
  let within24h = 0;

  for (const user of input.users) {
    const createdMs = new Date(user.createdAt).getTime();
    const actionIso = input.firstActionAtByUser.get(user.id);
    const elapsed = actionIso === undefined ? null : Math.max(0, (new Date(actionIso).getTime() - createdMs) / 60_000);
    if (elapsed !== null) minutes.push(elapsed);

    // Denominador só com quem já teve tempo de chegar lá: sem isso, quem entrou há 1 min derruba o "em 10 min".
    if (nowMs - createdMs >= 10 * 60_000) {
      olderThan10 += 1;
      if (elapsed !== null && elapsed <= 10) within10 += 1;
    }
    if (nowMs - createdMs >= DAY_MS) {
      olderThan24h += 1;
      if (elapsed !== null && elapsed <= 24 * 60) within24h += 1;
    }
  }

  minutes.sort((a, b) => a - b);
  return {
    totalUsers: input.users.length,
    reachedCount: minutes.length,
    pctReached: pct(minutes.length, input.users.length),
    medianMinutes: percentile(minutes, 0.5),
    p90Minutes: percentile(minutes, 0.9),
    pctWithin10Min: pct(within10, olderThan10),
    pctWithin24h: pct(within24h, olderThan24h),
  };
}

export function computeMvpMetrics(input: MvpMetricsInput): MvpMetrics {
  return { retention: computeRetention(input), firstAction: computeFirstAction(input) };
}
