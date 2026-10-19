import { z } from 'zod';
import {
  cancelGoal,
  cancelReminder,
  deactivateRecurringBill,
  deleteNote,
  deleteTask,
  deleteTransaction,
  findLastSuccessfulToolCall,
} from '@zapbuddy/db';
import { defineTool, type ToolContext } from '../tool-types.js';
import { deleteGoogleCalendarEvent } from '../../google/calendar.js';
import { getFreshCalendarAccess } from '../../google/calendar-access.js';

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
};

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
      await deleteGoogleCalendarEvent(access.accessToken, access.calendarId, resultId);
      return true;
    }
    default:
      return false;
  }
}

/**
 * Desfaz a última criação feita pela própria pessoa nos últimos 10 minutos
 * (lançamento, tarefa, lembrete, nota, conta, meta ou evento). Usa o log de
 * tool calls como fonte: nada novo é guardado. Só volta uma ação por vez, e
 * nunca desfaz a mesma duas vezes.
 */
export const undoLastActionTool = defineTool({
  name: 'undo_last_action',
  description:
    'Desfaz a última coisa que a pessoa acabou de criar (lançamento, tarefa, lembrete, nota, conta recorrente, meta ' +
    'ou evento), se for dos últimos 10 minutos. Use quando ela disser "desfaz", "cancela isso", "foi engano". ' +
    'Nunca desfaz algo mais antigo e não desfaz duas vezes seguidas — se não houver nada, diga isso.',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const sinceIso = new Date(Date.now() - UNDO_WINDOW_MINUTES * 60 * 1000).toISOString();
    const candidate = await findLastSuccessfulToolCall(ctx.userId, Object.keys(UNDOABLE_ACTIONS), sinceIso);
    if (!candidate) return { undone: false, reason: 'nothing_to_undo' };

    const lastUndo = await findLastSuccessfulToolCall(ctx.userId, ['undo_last_action'], sinceIso);
    if (lastUndo && lastUndo.created_at > candidate.created_at) return { undone: false, reason: 'nothing_to_undo' };

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
