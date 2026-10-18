import { getSupabaseClient } from '../client.js';
import type { Reminder, ReminderRecurrence, ReminderStatus } from '../types.js';

export async function createReminder(
  accountId: string,
  userId: string,
  message: string,
  remindAtIso: string,
  taskId?: string,
  recurrence?: ReminderRecurrence,
): Promise<Reminder> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .insert({
      account_id: accountId,
      user_id: userId,
      message,
      remind_at: remindAtIso,
      task_id: taskId ?? null,
      recurrence: recurrence ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Reminder;
}

/**
 * Cancela um lembrete ainda pendente (não "concluído" — não existe conceito
 * de lembrete concluído, só disparado/cancelado/falhado). `eq('status',
 * 'pending')` evita cancelar um que já foi enviado ou já está cancelado —
 * `maybeSingle()` então retorna null tanto pra id de outra conta quanto pra
 * um que não está mais pendente, sem distinguir os dois casos (o chamador
 * não precisa saber qual).
 */
export async function cancelReminder(accountId: string, reminderId: string): Promise<Reminder | null> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('id', reminderId)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as Reminder | null) ?? null;
}

/** Reminders due now, used by the worker's scheduled sweep. */
export async function listDueReminders(nowIso: string): Promise<Reminder[]> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('remind_at', nowIso);

  if (error) throw error;
  return (data ?? []) as Reminder[];
}

export async function findPendingReminderById(reminderId: string): Promise<Reminder | null> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('id', reminderId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) throw error;
  return data as Reminder | null;
}

export async function markReminderSent(reminderId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('reminders')
    .update({ status: 'sent' })
    .eq('id', reminderId);

  if (error) throw error;
}

/**
 * Chamado quando TODAS as tentativas de envio (BullMQ) se esgotaram — ver
 * worker.ts. Sem isto, um lembrete que falhasse permanentemente (ex.: fora
 * da janela de 24h da WhatsApp Cloud API, que exige template aprovado pra
 * mensagem livre nesse caso) ficava preso em 'pending' pra sempre,
 * indistinguível de um que ainda vai disparar.
 */
export async function markReminderFailed(reminderId: string, reason: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('reminders')
    .update({ status: 'failed', failed_reason: reason.slice(0, 500) })
    .eq('id', reminderId)
    .eq('status', 'pending');

  if (error) throw error;
}

/**
 * Total atual de lembretes travados em 'failed', sem janela de tempo: a
 * tabela só guarda `created_at` (quando o lembrete foi agendado), não quando
 * ele falhou — um filtro por data aqui contaria errado (lembrete agendado há
 * dias mas que falhou hoje ficaria fora da janela "hoje").
 */
export async function countFailedReminders(): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed');

  if (error) throw error;
  return count ?? 0;
}

export async function listRecentFailedReminders(limit: number): Promise<Reminder[]> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Reminder[];
}

const DEFAULT_REMINDERS_BY_USER_LIMIT = 20;

/** Lembretes de um contato específico, mais recentes primeiro — uso: detalhe do contato no admin. */
export async function listRemindersByUser(
  userId: string,
  limit: number = DEFAULT_REMINDERS_BY_USER_LIMIT,
): Promise<Reminder[]> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Reminder[];
}

export const REMINDERS_PAGE_SIZE = 50;

export interface ReminderWithUser extends Reminder {
  users: { whatsapp_number: string; name: string | null } | null;
}

export interface ListRemindersResult {
  reminders: ReminderWithUser[];
  total: number;
}

export type RemindersSortColumn = 'remind_at' | 'status' | 'created_at';

const REMINDERS_SORT_COLUMNS: RemindersSortColumn[] = ['remind_at', 'status', 'created_at'];

export function isRemindersSortColumn(value: string | undefined): value is RemindersSortColumn {
  return REMINDERS_SORT_COLUMNS.includes(value as RemindersSortColumn);
}

/** Lista paginada de lembretes pro admin, com filtro opcional por status, nome/número do contato e ordenação por coluna. */
export async function listReminders(
  page: number,
  status?: ReminderStatus,
  sort: RemindersSortColumn = 'remind_at',
  ascending = false,
): Promise<ListRemindersResult> {
  const from = page * REMINDERS_PAGE_SIZE;
  const to = from + REMINDERS_PAGE_SIZE - 1;

  let query = getSupabaseClient()
    .from('reminders')
    .select('*, users(whatsapp_number, name)', { count: 'exact' })
    .order(sort, { ascending })
    .range(from, to);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { reminders: (data ?? []) as unknown as ReminderWithUser[], total: count ?? 0 };
}

/** Todos os lembretes do filtro (sem paginação) pro export CSV. */
export async function listAllRemindersForExport(status?: ReminderStatus): Promise<ReminderWithUser[]> {
  let query = getSupabaseClient()
    .from('reminders')
    .select('*, users(whatsapp_number, name)')
    .order('remind_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ReminderWithUser[];
}

/**
 * Cancelamento manual pelo admin — sem escopo de account_id (o admin opera
 * sobre qualquer conta) e nome distinto de `cancelReminder` acima (essa é a
 * versão usada pela tool do usuário, escopada por account_id) pra não
 * colidir. Só permitido a partir de 'pending' ou 'failed'; cancelar um já
 * 'sent' não faz sentido (mensagem já saiu). Devolve a linha cancelada (ou
 * null se não bateu o filtro) pro caller conseguir logar a ação de
 * auditoria sem precisar de uma segunda query.
 */
export async function adminCancelReminder(reminderId: string): Promise<Reminder | null> {
  const { data, error } = await getSupabaseClient()
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('id', reminderId)
    .in('status', ['pending', 'failed'])
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data as Reminder | null;
}
