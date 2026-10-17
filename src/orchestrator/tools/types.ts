export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolContext {
  clientId: string;
}

// Retorna sempre uma string (vira o conteúdo do tool_result pra Claude ler).
export type ToolHandler = (input: any, context: ToolContext) => Promise<string>;
