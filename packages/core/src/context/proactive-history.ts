import { logger } from '@zapbuddy/db';
import { appendTurns } from './conversation-context.js';

/**
 * Deixa o Tom saber, na conversa, de uma mensagem que ELE mandou sozinho (lembrete disparado, insight, resumo semanal, aviso
 * de data, reengajamento). Sem isso a próxima fala da pessoa chegava ao LLM sem contexto: "adia pra amanhã" depois de um
 * lembrete, ou "como assim?" depois de um insight, não tinham a que se referir.
 *
 * Melhor esforço: a mensagem JÁ foi entregue quando isto roda; falhar em registrá-la (Redis fora, cota) nunca pode virar erro do
 * job — o retry reenviaria uma mensagem que a pessoa já recebeu.
 */
export async function recordProactiveMessage(whatsappNumber: string, text: string): Promise<void> {
  try {
    await appendTurns(whatsappNumber, [{ role: 'assistant', content: text, at: new Date().toISOString() }]);
  } catch (error) {
    logger.warn('proactive_history_append_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
