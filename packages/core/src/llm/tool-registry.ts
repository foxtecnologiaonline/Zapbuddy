import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from './tool-types.js';
import { recordTransactionTool, getSummaryTool } from './tools/finance.js';
import { createTaskTool, listTasksTool, completeTaskTool } from './tools/tasks.js';
import { createReminderTool } from './tools/reminders.js';
import { completeOnboardingTool } from './tools/onboarding.js';
import { sendDashboardLoginLinkTool } from './tools/dashboard-access.js';

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

/**
 * Anthropic Messages API tool definitions (JSON Schema input). Sem
 * `target: 'openApi3'` de propósito: esse target produz o formato antigo
 * (draft-04) de `exclusiveMinimum`/`exclusiveMaximum` como booleano pareado
 * com `minimum`/`maximum` (ex.: `{exclusiveMinimum: true, minimum: 0}`),
 * inválido em JSON Schema moderno — a Anthropic passou a validar
 * `input_schema` estritamente contra draft 2020-12 e rejeita isso. O target
 * default da lib (jsonSchema7) já produz o formato numérico correto
 * (`exclusiveMinimum: 0`). O `$schema` também é removido: a Anthropic espera
 * só o objeto de schema, sem metadado de dialeto.
 */
export function toAnthropicToolSpecs(): Anthropic.Tool[] {
  return ALL_TOOLS.map((tool) => {
    const { $schema: _schema, ...schema } = zodToJsonSchema(tool.schema) as Record<string, unknown>;
    return {
      name: tool.name,
      description: tool.description,
      input_schema: schema as Anthropic.Tool['input_schema'],
    };
  });
}
