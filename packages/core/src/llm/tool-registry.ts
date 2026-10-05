import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from './tool-types.js';
import { recordTransactionTool, getSummaryTool } from './tools/finance.js';
import { createTaskTool, listTasksTool, completeTaskTool } from './tools/tasks.js';
import { createReminderTool } from './tools/reminders.js';
import { completeOnboardingTool } from './tools/onboarding.js';
import { sendDashboardLoginLinkTool } from './tools/dashboard-access.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: ToolDefinition<any>[] = [
  recordTransactionTool,
  getSummaryTool,
  createTaskTool,
  listTasksTool,
  completeTaskTool,
  createReminderTool,
  completeOnboardingTool,
  sendDashboardLoginLinkTool,
];

export function getToolByName(name: string) {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

/** Anthropic Messages API tool definitions (JSON Schema input). */
export function toAnthropicToolSpecs(): Anthropic.Tool[] {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToJsonSchema(tool.schema, { target: 'openApi3' }) as Anthropic.Tool['input_schema'],
  }));
}
