/**
 * Quebra de linha depois de cada frase da resposta do Tom. A instrução no
 * system prompt sozinha não bastou (o modelo juntava duas frases numa linha
 * mesmo com a regra escrita), então isto roda também no código, antes do
 * envio — o prompt continua pedindo, mas esta função garante.
 *
 * Só quebra quando o ponto/exclamação/interrogação é seguido de espaço e de
 * uma letra maiúscula, número ou emoji — assim "R$ 27,90", "zapbuddy.vercel.app"
 * e abreviações comuns ("Sr. Silva") não são cortadas no meio. Linhas que já
 * são lista (•, -, *, "1.") ficam intactas, e nenhum "\n" que já existe é
 * mexido.
 */

const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s/;
const SENTENCE_END = /([.!?])[ \t]+(?=[\p{Lu}\p{N}\p{Extended_Pictographic}"“(¿¡])/gu;
const ABBREVIATION_BEFORE = /(?:^|\s)(?:sr|sra|srta|dr|dra|prof|profa|etc|ex|obs|aprox|vs|n|nº|nª)$/i;

function breakLine(line: string): string {
  return line.replace(SENTENCE_END, (match, punctuation: string, offset: number, whole: string) => {
    // "." de abreviação não é fim de frase; "!" e "?" nunca são abreviação.
    if (punctuation === '.' && ABBREVIATION_BEFORE.test(whole.slice(0, offset))) return match;
    return `${punctuation}\n`;
  });
}

export function breakLinesAfterSentences(text: string): string {
  return text
    .split('\n')
    .map((line) => (LIST_LINE.test(line) ? line : breakLine(line)))
    .join('\n');
}
