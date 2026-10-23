import type Anthropic from '@anthropic-ai/sdk';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from './tool-types.js';
import { recordTransactionTool, correctLastTransactionTool, getSummaryTool, setBudgetAlertTool } from './tools/finance.js';
import { createTaskTool, listTasksTool, completeTaskTool, deleteTaskTool, updateTaskTool } from './tools/tasks.js';
import { createReminderTool, cancelReminderTool, listRemindersTool, updateReminderTool } from './tools/reminders.js';
import { completeOnboardingTool, setPreferredNameTool } from './tools/onboarding.js';
import { sendDashboardLoginLinkTool } from './tools/dashboard-access.js';
import { inviteMemberTool, listMembersTool, getReferralInfoTool, registerPlanIntentTool } from './tools/account.js';
import { findDocumentTool } from './tools/documents.js';
import { createCalendarEventTool, listCalendarEventsTool, updateCalendarEventTool, deleteCalendarEventTool } from './tools/calendar.js';
import { webSearchTool } from './tools/web-search.js';
import { rememberFactTool, forgetFactTool } from './tools/memory.js';
import { createNoteTool, listNotesTool, deleteNoteTool, updateNoteTool } from './tools/notes.js';
import { createRecurringBillTool, listRecurringBillsTool, cancelRecurringBillTool } from './tools/bills.js';
import { createGoalTool, addGoalProgressTool, listGoalsTool } from './tools/savings-goals.js';
import { setQuietHoursTool, updateOccupationTool, setEmailTool } from './tools/preferences.js';
import { createHabitTool, logHabitCheckinTool, listHabitsTool, archiveHabitTool } from './tools/habits.js';
import { getWeatherTool } from './tools/weather.js';
import { getMarketRateTool } from './tools/markets.js';
import { undoLastActionTool } from './tools/undo.js';
import { rememberImportantDateTool, listImportantDatesTool, forgetImportantDateTool } from './tools/important-dates.js';
import { createPersonalGoalTool, listPersonalGoalsTool, completePersonalGoalTool, deletePersonalGoalTool } from './tools/goals.js';

export const ALL_TOOLS: ToolDefinition<any>[] = [
  recordTransactionTool,
  correctLastTransactionTool,
  getSummaryTool,
  setBudgetAlertTool,
  createTaskTool,
  listTasksTool,
  completeTaskTool,
  deleteTaskTool,
  updateTaskTool,
  createReminderTool,
  cancelReminderTool,
  listRemindersTool,
  updateReminderTool,
  completeOnboardingTool,
  setPreferredNameTool,
  sendDashboardLoginLinkTool,
  inviteMemberTool,
  listMembersTool,
  getReferralInfoTool,
  registerPlanIntentTool,
  findDocumentTool,
  createCalendarEventTool,
  listCalendarEventsTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
  webSearchTool,
  getWeatherTool,
  getMarketRateTool,
  rememberFactTool,
  forgetFactTool,
  createNoteTool,
  listNotesTool,
  deleteNoteTool,
  updateNoteTool,
  createRecurringBillTool,
  listRecurringBillsTool,
  cancelRecurringBillTool,
  createGoalTool,
  addGoalProgressTool,
  listGoalsTool,
  setQuietHoursTool,
  updateOccupationTool,
  setEmailTool,
  undoLastActionTool,
  rememberImportantDateTool,
  listImportantDatesTool,
  forgetImportantDateTool,
  createPersonalGoalTool,
  listPersonalGoalsTool,
  completePersonalGoalTool,
  deletePersonalGoalTool,
  createHabitTool,
  logHabitCheckinTool,
  listHabitsTool,
  archiveHabitTool,
];

export function getToolByName(name: string) {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

/**
 * JSON Schema (draft 2020-12) dos parâmetros de uma tool. Sem `target:
 * 'openApi3'` de propósito: esse target produz o formato antigo (draft-04)
 * de `exclusiveMinimum`/`exclusiveMaximum` como booleano pareado com
 * `minimum`/`maximum` (ex.: `{exclusiveMinimum: true, minimum: 0}`),
 * inválido em JSON Schema moderno — a Anthropic passou a validar
 * `input_schema` estritamente contra draft 2020-12 e rejeita isso. O target
 * default da lib (jsonSchema7) já produz o formato numérico correto
 * (`exclusiveMinimum: 0`), que também é o que a OpenAI espera em
 * `function.parameters` — mesma conversão serve os dois providers.
 */
function toolParameterSchema(tool: ToolDefinition<any>): Record<string, unknown> {
  const { $schema: _schema, ...schema } = zodToJsonSchema(tool.schema) as Record<string, unknown>;
  return schema;
}

/** Anthropic Messages API tool definitions (JSON Schema input). */
export function toAnthropicToolSpecs(): Anthropic.Tool[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: toolParameterSchema(tool) as Anthropic.Tool['input_schema'],
  }));
}

/** OpenAI Chat Completions function-calling tool definitions — usado só pelo provider de fallback. */
export function toOpenAiToolSpecs(): ChatCompletionTool[] {
  return ALL_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toolParameterSchema(tool),
    },
  }));
}
