import type { ReminderRecurrence } from '@zapbuddy/db';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Próxima ocorrência de um lembrete recorrente, a partir do remind_at que
 * acabou de disparar — usado por reminder-dispatch.ts pra criar a próxima
 * linha em `reminders` (cada ocorrência é sua própria linha/job, não um
 * `repeat` nativo do BullMQ — ver migration 0013). Pura (sem I/O), testável
 * sem mock de banco.
 *
 * Limitação conhecida e aceita: 'monthly' soma 1 mês via Date.setUTCMonth,
 * que no dia 31 de um mês mais curto "estoura" pro mês seguinte (ex.: 31/jan
 * → 3/mar, não 28/fev) — comportamento padrão do JS Date, não corrigido aqui
 * de propósito (evitar isso exigiria decidir uma regra de "fim de mês" que
 * não foi pedida).
 */
export function computeNextOccurrence(remindAtIso: string, recurrence: ReminderRecurrence): string {
  const current = new Date(remindAtIso);

  if (recurrence === 'daily') return new Date(current.getTime() + ONE_DAY_MS).toISOString();
  if (recurrence === 'weekly') return new Date(current.getTime() + 7 * ONE_DAY_MS).toISOString();

  const next = new Date(current);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}
