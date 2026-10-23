/**
 * Número de WhatsApp de contato (Brasil). Produto B2C brasileiro: aceita só
 * telefone brasileiro, com ou sem +55/0/máscara. Devolve sempre só dígitos
 * com 55 + DDD (o formato do wa_id e do `to` da Cloud API).
 */

/** Null quando não parece telefone brasileiro (DDD inexistente, tamanho errado, celular sem 9, fixo). */
export function normalizeBrazilianWhatsappNumber(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  digits = digits.replace(/^00/, '').replace(/^0+(?=\d{10,11}$)/, '');

  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;

  const ddd = Number(digits.slice(2, 4));
  if (ddd < 11 || ddd > 99 || String(ddd).includes('0')) return null;

  const local = digits.slice(4);
  // Celular: 9 dígitos começando em 9. Número de 8 dígitos começando em 6-9 é celular legado
  // (a Meta ainda entrega wa_id sem o 9 em alguns estados). Fixo (2-5) não tem WhatsApp.
  if (local.length === 9 && local[0] !== '9') return null;
  if (local.length === 8 && !/^[6-9]/.test(local)) return null;
  return digits;
}

/**
 * A Meta devolve o wa_id de alguns celulares brasileiros SEM o nono dígito
 * (55 + DDD + 8 dígitos), mesmo o contato tendo salvo o número com ele. Pra
 * casar contato ↔ remetente, toda comparação usa as duas variantes.
 */
export function whatsappNumberVariants(number: string): string[] {
  if (/^55\d{2}9\d{8}$/.test(number)) return [number, `${number.slice(0, 4)}${number.slice(5)}`];
  if (/^55\d{2}[6-9]\d{7}$/.test(number)) return [number, `${number.slice(0, 4)}9${number.slice(4)}`];
  return [number];
}

/** "+55 11 9****-4321" — o suficiente pra pessoa reconhecer o contato na confirmação, sem despejar o número inteiro. */
export function maskWhatsappNumber(number: string): string {
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(number);
  if (!match) return '+**';
  return `+55 ${match[1]} ${match[2]!.slice(0, 1)}${'*'.repeat(match[2]!.length - 1)}-${match[3]}`;
}
