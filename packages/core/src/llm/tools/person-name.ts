/**
 * Nome e ocupação vêm de texto livre da pessoa e são interpolados no system prompt de TODA mensagem (e gravados, e
 * exportados em CSV pelo admin). Sem limite nem filtro, um nome de 5 mil caracteres inflava o prompt, e um nome com
 * quebra de linha e "# Regras..." virava estrutura de prompt (auditoria 2026-11). Aqui entra só o que um nome tem.
 */

const MAX_NAME_LENGTH = 60;
const MAX_OCCUPATION_LENGTH = 80;

// Letras e marcas (acentos), dígitos, espaço, ponto, apóstrofo, hífen e emoji. Todo o resto some: quebra de linha, "#", ":",
// "=", "@", colchetes e asterisco, que são o que dá forma a instrução de prompt e a fórmula de planilha.
const NOT_ALLOWED = /[^\p{L}\p{M}\p{N} .'’\-\p{Extended_Pictographic}‍️]/gu;

function clean(raw: string, maxLength: number): string {
  const flat = raw.normalize('NFC').replace(NOT_ALLOWED, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= maxLength) return flat;
  // Corta sem deixar meia palavra pendurada.
  const cut = flat.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Nome utilizável ou null (sem nenhuma letra: só emoji, símbolo ou vazio). */
export function sanitizePersonName(raw: string): string | null {
  const name = clean(raw, MAX_NAME_LENGTH).replace(/^[.'’\-\s]+/, '');
  return /\p{L}/u.test(name) ? name : null;
}

/** Ocupação opcional: texto curto sem estrutura; vazio vira undefined (nunca apaga um valor anterior por engano). */
export function sanitizeOccupation(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const occupation = clean(raw, MAX_OCCUPATION_LENGTH);
  return occupation === '' ? undefined : occupation;
}
