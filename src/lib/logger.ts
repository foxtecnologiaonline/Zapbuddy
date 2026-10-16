type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  clientId?: string;
  whatsappId?: string;
  messageId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};

// Toda tool call da IA (nome + parâmetros + resultado) deve passar por aqui
// — é o principal insumo de debug de erros de interpretação de linguagem
// natural (ver CLAUDE.md).
export function logToolCall(toolName: string, params: unknown, result: unknown, context?: LogContext): void {
  logger.info('tool_call', { ...context, toolName, params, result });
}
