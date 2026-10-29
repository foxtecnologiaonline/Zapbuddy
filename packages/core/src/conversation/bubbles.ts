/**
 * Resposta em vários balões, como uma pessoa mandaria. A fronteira de balão é
 * uma LINHA EM BRANCO que o próprio Tom escreve (ver prompt): quebra simples
 * continua sendo a mesma mensagem (listas, exemplos). No máximo 3 balões — o
 * excedente se junta ao último, nunca vira uma metralhadora de mensagens.
 */
export const MAX_BUBBLES = 3;

export function splitIntoBubbles(text: string): string[] {
  const parts = text
    .split(/\n[ \t]*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= MAX_BUBBLES) return parts.length > 0 ? parts : [text.trim()];
  return [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join('\n\n')];
}

/** Pausa antes de um balão (digitando…): proporcional ao tamanho, com piso e teto — humano, mas sem enrolar. */
export function bubbleDelayMs(bubble: string): number {
  return Math.min(2200, Math.max(700, 500 + bubble.length * 15));
}
