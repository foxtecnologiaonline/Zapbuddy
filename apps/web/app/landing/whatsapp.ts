/**
 * Monta o link de entrada no Tom pelo WhatsApp. Sem número válido devolve null — quem chama
 * decide o fallback (a LP usa a seção de preço), em vez de gerar um link quebrado.
 */
export function normalizeWhatsAppNumber(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function buildWhatsAppLink(raw: string | undefined, prefilledText: string): string | null {
  const number = normalizeWhatsAppNumber(raw);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(prefilledText)}`;
}
