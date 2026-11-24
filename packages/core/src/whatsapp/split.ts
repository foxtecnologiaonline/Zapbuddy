/**
 * Divisão de texto longo pro limite do WhatsApp. A Cloud API recusa corpo de texto acima de 4.096 caracteres (a Evolution também
 * costuma engasgar), e uma resposta longa (revisão, lista grande, explicação) virava erro de envio: o turno falhava, o retry repetia a
 * chamada ao LLM e a pessoa recebia "tive um problema técnico". 4.000 deixa folga pro que o WhatsApp contar diferente (emoji).
 */
export const WHATSAPP_MAX_CHARS = 4000;

/** Evita cortar no meio de um par substituto (emoji): o corte recua um caractere se cair entre as duas metades. */
function safeCut(text: string, cut: number): number {
  const previous = text.charCodeAt(cut - 1);
  return previous >= 0xd800 && previous <= 0xdbff ? cut - 1 : cut;
}

function bestCut(window: string, max: number): number {
  const minimum = Math.floor(max * 0.5); // não corta cedo demais só pra achar um "bom" ponto
  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph >= minimum) return paragraph;
  const line = window.lastIndexOf('\n');
  if (line >= minimum) return line;
  const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (sentence >= minimum) return sentence + 1;
  const space = window.lastIndexOf(' ');
  if (space >= minimum) return space;
  return safeCut(window, max);
}

/** Texto que cabe numa mensagem volta inteiro; o que não cabe é cortado em parágrafo, linha, frase ou palavra, nessa ordem. */
export function splitForWhatsapp(text: string, max: number = WHATSAPP_MAX_CHARS): string[] {
  if (text.length <= max) return [text];

  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const cut = bestCut(remaining.slice(0, max), max);
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts.filter((part) => part.length > 0);
}
