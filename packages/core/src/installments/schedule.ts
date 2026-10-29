/**
 * Calendário de parcelamentos (puro). Datas como chave local YYYY-MM-DD — sem
 * fuso nem hora, igual `habits/streak.ts`. Dia 31 num mês de 30 dias cai no
 * último dia do mês (mesma regra de `daysUntilDueDay` nas contas recorrentes).
 */
export interface InstallmentPlanLike {
  description: string;
  installment_cents: number;
  total_installments: number;
  /** YYYY-MM-01 */
  first_due_month: string;
  due_day: number;
}

export interface RecurringBillLike {
  name: string;
  amountCents: number;
  dueDay: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function monthKeyPlus(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const index = year * 12 + (month - 1) + offset;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

function clampedDay(monthKey: string, day: number): number {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  return Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

/** Data (YYYY-MM-DD) de cada parcela, da 1ª à última. */
export function installmentDueDates(plan: Pick<InstallmentPlanLike, 'first_due_month' | 'due_day' | 'total_installments'>): string[] {
  const firstMonth = plan.first_due_month.slice(0, 7);
  return Array.from({ length: plan.total_installments }, (_, index) => {
    const month = monthKeyPlus(firstMonth, index);
    return `${month}-${pad(clampedDay(month, plan.due_day))}`;
  });
}

export interface PlanStatus {
  paid: number;
  remaining: number;
  remainingCents: number;
  nextDueDate: string | null;
  finished: boolean;
}

/** "Pagas" = parcelas com data anterior a hoje (a pessoa não marca pagamento; o calendário avança sozinho). */
export function planStatus(plan: InstallmentPlanLike, todayKey: string): PlanStatus {
  const dates = installmentDueDates(plan);
  const paid = dates.filter((date) => date < todayKey).length;
  const remaining = dates.length - paid;
  return {
    paid,
    remaining,
    remainingCents: remaining * plan.installment_cents,
    nextDueDate: dates.find((date) => date >= todayKey) ?? null,
    finished: remaining === 0,
  };
}

export interface MonthCommitment {
  month: string;
  installmentsCents: number;
  billsCents: number;
  totalCents: number;
  items: Array<{ label: string; amountCents: number; kind: 'installment' | 'bill'; dueDate: string }>;
}

/**
 * O que já está comprometido nos próximos meses: parcelas ainda por vencer +
 * contas recorrentes. No mês corrente conta só o que ainda não passou do dia de
 * hoje ("restante do mês"). Só dado que a pessoa informou — nada estimado.
 */
export function monthlyCommitments(
  plans: InstallmentPlanLike[],
  bills: RecurringBillLike[],
  todayKey: string,
  months: number,
): MonthCommitment[] {
  const currentMonth = todayKey.slice(0, 7);
  const result: MonthCommitment[] = [];

  for (let offset = 0; offset < months; offset += 1) {
    const month = monthKeyPlus(currentMonth, offset);
    const items: MonthCommitment['items'] = [];

    for (const plan of plans) {
      installmentDueDates(plan).forEach((dueDate, index) => {
        if (dueDate.slice(0, 7) === month && dueDate >= todayKey) {
          items.push({ label: `${plan.description} (${index + 1}/${plan.total_installments})`, amountCents: plan.installment_cents, kind: 'installment', dueDate });
        }
      });
    }
    for (const bill of bills) {
      const dueDate = `${month}-${pad(clampedDay(month, bill.dueDay))}`;
      if (dueDate >= todayKey) items.push({ label: bill.name, amountCents: bill.amountCents, kind: 'bill', dueDate });
    }

    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const installmentsCents = items.filter((item) => item.kind === 'installment').reduce((sum, item) => sum + item.amountCents, 0);
    const billsCents = items.filter((item) => item.kind === 'bill').reduce((sum, item) => sum + item.amountCents, 0);
    result.push({ month, installmentsCents, billsCents, totalCents: installmentsCents + billsCents, items });
  }
  return result;
}
