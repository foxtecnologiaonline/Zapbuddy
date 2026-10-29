import { z } from 'zod';
import {
  cancelGoal,
  cancelReminder,
  deactivateRecurringBill,
  deleteHabit,
  deleteHabitCheckin,
  deleteImportantDate,
  deleteNote,
  deletePersonalGoal,
  deleteTask,
  deleteTransaction,
  findLastSuccessfulToolCall,
} from '@zapbuddy/db';
import { defineTool, type ToolContext } from '../tool-types.js';
import { deleteCalendarEvent, getFreshCalendarAccess } from '../../calendar/calendar-access.js';

const UNDO_WINDOW_MINUTES = 10;

/** Ações de criação que a pessoa pode desfazer, com o campo do resultado que traz o id. */
const UNDOABLE_ACTIONS: Record<string, string> = {
  record_transaction: 'transaction_id',
  create_task: 'task_id',
  create_reminder: 'reminder_id',
  create_note: 'note_id',
  create_recurring_bill: 'bill_id',
  create_goal: 'goal_id',
  create_calendar_event: 'event_id',
  remember_important_date: 'important_date_id',
  create_personal_goal: 'goal_id',
  create_habit: 'habit_id',
  log_habit_checkin: 'checkin_id',
};

/**
 * Ações que mudam ou apagam algo que já existia e que o desfazer NÃO sabe
 * reverter. Se uma delas é mais recente que a última criação, "desfaz" pode
 * estar se referindo a ela — apagar a criação anterior seria destrutivo e
 * surpreendente (ex.: editar uma tarefa e pedir "desfaz" apagaria a tarefa).
 */
const NON_UNDOABLE_ACTIONS = [
  'manage_list',
  'manage_installments',
  'update_task',
  'update_note',
  'update_reminder',
  'update_calendar_event',
  'delete_calendar_event',
  'complete_task',
  'delete_task',
  'delete_note',
  'cancel_reminder',
  'correct_last_transaction',
];

async function revertAction(toolName: string, resultId: string, ctx: ToolContext): Promise<boolean> {
  switch (toolName) {
    case 'record_transaction':
      return deleteTransaction(ctx.accountId, resultId);
    case 'create_task':
      return (await deleteTask(ctx.accountId, resultId)) !== null;
    case 'create_reminder':
      return (await cancelReminder(ctx.accountId, resultId)) !== null;
    case 'create_note':
      return (await deleteNote(ctx.accountId, resultId)) !== null;
    case 'create_recurring_bill':
      return (await deactivateRecurringBill(ctx.accountId, resultId)) !== null;
    case 'create_goal':
      return (await cancelGoal(ctx.accountId, resultId)) !== null;
    case 'create_calendar_event': {
      const access = await getFreshCalendarAccess(ctx.accountId);
      if (!access) return false;
      await deleteCalendarEvent(access, resultId);
      return true;
    }
    case 'remember_important_date':
      return (await deleteImportantDate(ctx.accountId, resultId)) !== null;
    case 'create_personal_goal':
      return (await deletePersonalGoal(ctx.accountId, resultId)) !== null;
    case 'create_habit':
      return (await deleteHabit(ctx.accountId, resultId)) !== null;
    case 'log_habit_checkin':
      return deleteHabitCheckin(ctx.accountId, resultId);
    default:
      return false;
  }
}

/**
 * Desfaz a última criação feita pela própria pessoa nos últimos 10 minutos
 * (lançamento, tarefa, lembrete, nota, conta recorrente, meta com valor,
 * meta pessoal, data importante, hábito, check-in de hábito ou evento). Usa o log de tool calls como
 * fonte: nada novo é guardado. Só volta uma ação por vez, e nunca desfaz a
 * mesma duas vezes.
 */
export const undoLastActionTool = defineTool({
  name: 'undo_last_action',
  description:
    'Desfaz a última criação dela (lançamento, tarefa, lembrete, nota, conta, meta, data, hábito, check-in ou evento) se tiver menos de 10 min. Use em "desfaz"/"foi engano". Não desfaz duas vezes nem algo mais antigo; reason last_action_not_undoable = a última foi edição/conclusão/exclusão: diga que não dá e ofereça corrigir na conversa.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const sinceIso = new Date(Date.now() - UNDO_WINDOW_MINUTES * 60 * 1000).toISOString();
    const candidate = await findLastSuccessfulToolCall(ctx.userId, Object.keys(UNDOABLE_ACTIONS), sinceIso);
    if (!candidate) return { undone: false, reason: 'nothing_to_undo' };

    const [lastUndo, lastNonUndoable] = await Promise.all([
      findLastSuccessfulToolCall(ctx.userId, ['undo_last_action'], sinceIso),
      findLastSuccessfulToolCall(ctx.userId, NON_UNDOABLE_ACTIONS, sinceIso),
    ]);
    if (lastUndo && lastUndo.created_at > candidate.created_at) return { undone: false, reason: 'nothing_to_undo' };
    if (lastNonUndoable && lastNonUndoable.created_at > candidate.created_at) {
      return { undone: false, reason: 'last_action_not_undoable', last_action: lastNonUndoable.tool_name };
    }

    const resultKey = UNDOABLE_ACTIONS[candidate.tool_name];
    const result = (candidate.result ?? {}) as Record<string, unknown>;
    const resultId = resultKey !== undefined && typeof result[resultKey] === 'string' ? result[resultKey] : null;
    if (typeof resultId !== 'string') return { undone: false, reason: 'unknown_target' };

    const reverted = await revertAction(candidate.tool_name, resultId, ctx);
    return reverted
      ? { undone: true, undone_action: candidate.tool_name }
      : { undone: false, reason: 'already_removed' };
  },
});
