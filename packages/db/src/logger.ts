type LogContext = Record<string, unknown>;

/**
 * Logger estruturado mínimo — substitui console.log/error/warn ad-hoc por
 * JSON lines com nível, evento e contexto (userId/waMessageId/toolName etc.),
 * pra correlacionar entradas no log do host (Vercel/VPS) sem precisar de
 * infra nova. Vive em packages/db (a base, sem dependências internas) pra
 * poder ser usado tanto por packages/core (que já depende de db) quanto
 * pelos próprios repositórios de db, sem criar dependência circular.
 */
function emit(level: 'info' | 'warn' | 'error', event: string, context?: LogContext): void {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...context });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, context?: LogContext) => emit('info', event, context),
  warn: (event: string, context?: LogContext) => emit('warn', event, context),
  error: (event: string, context?: LogContext) => emit('error', event, context),
};
