export class AppError extends Error {
  constructor(message: string, public readonly userMessage: string) {
    super(message);
    this.name = "AppError";
  }
}

// Nenhum erro técnico cru chega ao usuário: toda exception é traduzida aqui antes de qualquer
// resposta no WhatsApp.
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("timeout")) {
      return "Demorei mais do que deveria pra processar isso. Pode tentar de novo?";
    }
    if (error.message.toLowerCase().includes("supabase") || error.message.toLowerCase().includes("duplicate key")) {
      return "Não consegui salvar isso agora. Nada foi perdido — pode mandar de novo em instantes.";
    }
  }

  return "Algo deu errado do meu lado. Pode repetir a mensagem?";
}
