/**
 * Agradecimento puro ("valeu", "obrigado"): vira reação ❤️ em vez de mais um
 * texto — como um amigo faria. Só agradecimento: "ok"/"blz"/👍 podem ser um
 * "sim" à pergunta anterior do Tom, então passam pelo LLM. E se a última fala do
 * Tom foi uma pergunta, nem agradecimento é tratado aqui ("valeu, pode ser").
 */
const GRATITUDE = new Set([
  'obrigado', 'obrigada', 'obg', 'brigado', 'brigada', 'brigadao', 'obrigadao', 'valeu', 'vlw', 'valeu demais', 'muito obrigado', 'muito obrigada',
  'obrigado tom', 'obrigada tom', 'valeu tom', 'vlw tom', 'brigado tom', 'obrigadinho', 'obrigadinha', 'agradecido', 'agradecida', '🙏', '🙏🙏',
]);

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[!.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGratitudeOnly(message: string): boolean {
  return GRATITUDE.has(normalize(message));
}

// Termina em "?" mesmo com emoji ou pontuação depois ("Quer que eu remarque? 🙂").
const ENDS_WITH_QUESTION = /\?[\s\p{Extended_Pictographic}\p{P}\p{S}\uFE0F\u200D]*$/u;

export function lastAssistantAskedQuestion(history: Array<{ role: 'user' | 'assistant'; content: string }>): boolean {
  const last = [...history].reverse().find((turn) => turn.role === 'assistant');
  return last ? ENDS_WITH_QUESTION.test(last.content.trim()) : false;
}

export const GRATITUDE_REACTION = '❤️';
