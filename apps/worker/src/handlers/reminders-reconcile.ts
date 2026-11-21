import { findUserById, listDueReminders, markReminderFailed, logger } from '@zapbuddy/db';
import { getLocalHour, getReminderDispatchQueue, isWithinQuietHours } from '@zapbuddy/core';

/** Um job normal dispara em segundos; 10 min de atraso e ainda `pending` quase certamente é job que sumiu da fila. */
export const RECONCILE_GRACE_MS = 10 * 60_000;
/** Além de 24h sem disparo a janela de texto livre da Meta provavelmente já fechou e o lembrete perdeu o sentido. */
export const RECONCILE_MAX_LATE_MS = 24 * 60 * 60_000;
/** Teto por passada: depois de uma queda longa do Redis podem ser milhares; o resto segue na próxima hora. */
export const RECONCILE_BATCH_LIMIT = 200;

/**
 * Rede de segurança dos lembretes: "me lembra de X às 10h" vira um job atrasado no Redis, e o Redis já perdeu jobs duas vezes
 * (cota do Upstash estourada, banco recriado) — o lembrete ficava `pending` pra sempre e nunca chegava, sem nenhum aviso. Roda
 * dentro do sweep horário (sem fila nova, por causa da cota).
 *
 * - Vencido há 10 min–24h e ainda `pending`: reenfileira com o próprio id como `jobId`. Se o job ainda existe (atrasado, ativo ou
 *   retido), o BullMQ ignora o `add` e nada é enviado em dobro; se sumiu, dispara agora. O handler continua idempotente.
 * - Vencido há mais de 24h: marca `failed` com o motivo (some do "pendente" e aparece no card de falhas do admin), em vez de
 *   mandar um lembrete de ontem ou deixá-lo preso pra sempre.
 * - Pessoa dentro do horário de silêncio: adia pra próxima passada. O lembrete que ela agendou vale na hora marcada, mas um
 *   atrasado de madrugada só acorda; se o silêncio passar de 24h de atraso, cai na regra acima.
 *
 * Nunca lança: manutenção não pode derrubar o resto do sweep.
 */
export async function reconcileOverdueReminders(now: Date = new Date()): Promise<void> {
  try {
    const overdue = (await listDueReminders(new Date(now.getTime() - RECONCILE_GRACE_MS).toISOString())).sort(
      (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime(),
    );
    if (overdue.length === 0) return;

    const queue = getReminderDispatchQueue();
    let requeued = 0;
    let expired = 0;
    let deferred = 0;

    for (const reminder of overdue.slice(0, RECONCILE_BATCH_LIMIT)) {
      try {
        const lateMs = now.getTime() - new Date(reminder.remind_at).getTime();
        if (lateMs > RECONCILE_MAX_LATE_MS) {
          await markReminderFailed(reminder.id, 'Não disparou: venceu há mais de 24h sem job na fila (fila indisponível?).');
          expired += 1;
          continue;
        }

        const user = await findUserById(reminder.user_id);
        if (!user) continue; // mesmo critério do despacho: sem pessoa, nada a enviar
        if (isWithinQuietHours(getLocalHour(user.timezone, now), user.quiet_hours_start, user.quiet_hours_end)) {
          deferred += 1;
          continue;
        }

        await queue.add('dispatch', { reminderId: reminder.id }, { jobId: reminder.id });
        requeued += 1;
      } catch (error) {
        logger.error('reminder_reconcile_item_failed', { reminderId: reminder.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    logger.warn('reminders_reconciled', { overdue: overdue.length, requeued, expired, deferred, truncated: overdue.length > RECONCILE_BATCH_LIMIT });
  } catch (error) {
    logger.error('reminders_reconcile_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
