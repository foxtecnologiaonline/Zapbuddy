import type { z } from 'zod';
import type { AccountRole } from '@zapbuddy/db';

export interface ToolContext {
  userId: string;
  whatsappNumber: string;
  /** Source of the message that triggered this tool call (for transactions). */
  messageSource: 'text' | 'audio';
  /** IANA timezone do usuário — usado por tools que calculam limites de data (ex. resumo financeiro). */
  timezone: string;
  /** Escopo de dado (ADR 0002) — financeiro/tarefas/lembretes/documentos/agenda são por conta, não por usuário. */
  accountId: string;
  /** Só 'owner' pode convidar novos membros (tools/account.ts) — checado em código, nunca decidido pelo modelo. */
  role: AccountRole;
  /** Um id novo por mensagem da pessoa. Ações que EXIGEM uma confirmação dela (recado a terceiro) comparam com o turno em que foram preparadas: confirmar no mesmo turno é impossível. */
  turnId: string;
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
