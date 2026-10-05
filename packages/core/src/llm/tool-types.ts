import type { z } from 'zod';

export interface ToolContext {
  userId: string;
  whatsappNumber: string;
  /** Source of the message that triggered this tool call (for transactions). */
  messageSource: 'text' | 'audio';
}

export interface ToolDefinition<Schema extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: Schema;
  execute: (params: z.infer<Schema>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<Schema extends z.ZodTypeAny>(
  def: ToolDefinition<Schema>,
): ToolDefinition<Schema> {
  return def;
}
