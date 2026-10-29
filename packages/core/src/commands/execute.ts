import {
  claimProactiveMessage,
  findListByName,
  listAccountLists,
  listItemsOfList,
  listPendingItemCounts,
  listTasks,
  saveMorningDigestPreferences,
  saveRoutinePrefs,
  summarizeTransactions,
  type User,
} from '@zapbuddy/db';
import type { ToolContext } from '../llm/tool-types.js';
import { undoLastActionTool } from '../llm/tools/undo.js';
import { loadDayOverview } from '../planning/day-overview.js';
import { formatDayOverview } from '../planning/day-format.js';
import { formatPendingTasks } from '../planning/tasks-format.js';
import { formatListText, formatListsOverview } from '../lists/format.js';
import { formatSpendingSummary } from '../finance/spending-format.js';
import { getCurrentMonthRange, getLast7DaysRange, getTodayRange } from '../time/zoned-ranges.js';
import { scheduleFocusEnd } from '../focus/schedule.js';
import { SKILL_TIP_KIND, buildDayCloseMessage, buildWeekReviewMessage, selectSkillTip, type RoutineSubject } from '../routines/build.js';
import { formatHelpOverview, formatHelpTopic, formatHelpTopicNotFound, formatNoMoreTips, formatSkillTip } from './help.js';
import type { Command, RoutineName } from './parse.js';

export interface CommandExecContext {
  user: User;
  toolContext: ToolContext;
}

const UNDONE_LABELS: Record<string, string> = {
  record_transaction: 'o lançamento',
  create_task: 'a tarefa',
  create_reminder: 'o lembrete',
  create_note: 'a nota',
  create_recurring_bill: 'a conta recorrente',
  create_goal: 'a meta',
  create_calendar_event: 'o evento da agenda',
  remember_important_date: 'a data importante',
  create_personal_goal: 'a meta pessoal',
  create_habit: 'o hábito',
  log_habit_checkin: 'a marcação do hábito',
};

function routineSubject(ctx: CommandExecContext): RoutineSubject {
  return {
    accountId: ctx.toolContext.accountId,
    timeZone: ctx.user.timezone,
    quietHoursStart: ctx.user.quiet_hours_start,
    quietHoursEnd: ctx.user.quiet_hours_end,
    name: ctx.user.preferred_name ?? ctx.user.name?.trim().split(/\s+/)[0] ?? null,
  };
}

const ROUTINE_FIELD: Record<RoutineName, 'routine_day_close' | 'routine_week_review' | 'routine_checkins'> = {
  day_close: 'routine_day_close',
  week_review: 'routine_week_review',
  checkins: 'routine_checkins',
};

const ROUTINE_ON_TEXT: Record<RoutineName, string> = {
  day_close: 'Ligado! Toda noite, por volta das 20h, eu fecho seu dia: o que você fez, o que ficou e o que vem amanhã.',
  week_review: 'Ligado! Todo domingo no fim da tarde eu te mando a revisão da semana e já te ofereço um plano pra segunda.',
  checkins: 'Ligado! Depois dos seus compromissos e tarefas com hora, eu te pergunto como foi.',
};
const ROUTINE_OFF_TEXT: Record<RoutineName, string> = {
  day_close: 'Desliguei o fechamento do dia. Quando quiser de volta, manda "ligar fechamento do dia".',
  week_review: 'Desliguei a revisão da semana. Pra voltar, manda "ligar revisão da semana".',
  checkins: 'Pronto, não pergunto mais "como foi". Pra voltar, manda "ligar check-ins".',
};

/**
 * Executa um comando direto (sem LLM). Devolve o texto da resposta, ou null
 * quando não dá pra resolver sozinho — aí a mensagem segue pro LLM normalmente.
 */
export async function executeCommand(command: Command, ctx: CommandExecContext): Promise<string | null> {
  const { user, toolContext } = ctx;
  const accountId = toolContext.accountId;

  switch (command.kind) {
    case 'help': {
      if (!command.topic) return formatHelpOverview();
      return formatHelpTopic(command.topic) ?? formatHelpTopicNotFound();
    }

    case 'overview': {
      const data = await loadDayOverview({
        accountId,
        timeZone: user.timezone,
        quietHoursStart: user.quiet_hours_start,
        quietHoursEnd: user.quiet_hours_end,
        period: command.period,
      });
      return formatDayOverview(data);
    }

    case 'tasks': {
      const tasks = await listTasks(accountId, 'pending', 50);
      return formatPendingTasks(
        tasks.map((task) => ({ title: task.title, dueIso: task.due_at })),
        user.timezone,
      );
    }

    case 'spending': {
      const range = command.period === 'today' ? getTodayRange(user.timezone) : command.period === 'week' ? getLast7DaysRange(user.timezone) : getCurrentMonthRange(user.timezone);
      const periodLabel = command.period === 'today' ? 'hoje' : command.period === 'week' ? 'nos últimos 7 dias' : 'neste mês';
      const summary = await summarizeTransactions(accountId, range.startIso, range.endIso);
      return formatSpendingSummary({ periodLabel, ...summary });
    }

    case 'lists': {
      const [lists, counts] = await Promise.all([listAccountLists(accountId), listPendingItemCounts(accountId)]);
      return formatListsOverview(lists.map((list) => ({ name: list.name, pending: counts[list.id]?.pending ?? 0, done: counts[list.id]?.done ?? 0 })));
    }

    case 'list_show': {
      const list = await findListByName(accountId, command.name);
      if (!list) return null; // pode não ser uma lista (ex.: "lista de presentes pro Natal"): deixa o LLM entender.
      return formatListText(list, await listItemsOfList(list.id));
    }

    case 'undo': {
      const result = (await undoLastActionTool.execute({}, toolContext)) as { undone: boolean; reason?: string; undone_action?: string };
      if (result.undone) return `Pronto, desfiz ${UNDONE_LABELS[result.undone_action ?? ''] ?? 'a última coisa que você criou'}.`;
      if (result.reason === 'last_action_not_undoable') {
        return 'A última coisa foi uma edição, conclusão ou exclusão, e essas eu não consigo desfazer por aqui.\nMe diz o que você quer ajustar que eu corrijo.';
      }
      if (result.reason === 'nothing_to_undo') return 'Não tem nada recente pra desfazer.\nSó consigo voltar o que você criou nos últimos 10 minutos.';
      return null;
    }

    case 'digest': {
      await saveMorningDigestPreferences(user.id, { enabled: command.enabled });
      return command.enabled
        ? `Ligado! Todo dia, por volta das ${user.morning_digest_hour}h, eu te mando o resumo da manhã.`
        : 'Desliguei o resumo da manhã. Pra voltar, manda "ligar resumo".';
    }

    case 'tip': {
      const skill = await selectSkillTip(user.id, accountId);
      if (!skill) return formatNoMoreTips();
      await claimProactiveMessage(accountId, SKILL_TIP_KIND, skill.id);
      return formatSkillTip(skill);
    }

    case 'tips': {
      await saveRoutinePrefs(user.id, { routine_weekly_tip: command.enabled });
      return command.enabled ? 'Ligado! Uma vez por semana eu te conto uma coisa nova que sei fazer.' : 'Pronto, sem dicas semanais. Se quiser uma na hora, é só mandar "dica".';
    }

    case 'routine': {
      await saveRoutinePrefs(user.id, { [ROUTINE_FIELD[command.routine]]: command.enabled });
      return command.enabled ? ROUTINE_ON_TEXT[command.routine] : ROUTINE_OFF_TEXT[command.routine];
    }

    case 'run_routine': {
      const message = command.routine === 'day_close' ? await buildDayCloseMessage(routineSubject(ctx)) : await buildWeekReviewMessage(routineSubject(ctx));
      return message ?? 'Não consegui montar isso agora. Tenta de novo daqui a pouco.';
    }

    case 'focus': {
      await scheduleFocusEnd(accountId, user.id, command.minutes);
      return `⏱️ Foco de ${command.minutes} minutos começou!\nTe aviso quando acabar. Bom trabalho.`;
    }
  }
}
