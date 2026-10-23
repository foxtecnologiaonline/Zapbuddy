/**
 * Link "click-to-chat" do WhatsApp com o texto já preenchido: a PESSOA toca,
 * o WhatsApp dela abre a conversa e ela mesma aperta enviar. O Tom nunca envia
 * nada a terceiros (decisão do dono do produto, ver ADR 0007) — só redige e
 * entrega este link.
 *
 * Com número: abre direto a conversa com o contato. Sem número: `wa.me/?text=`
 * abre a lista de conversas do WhatsApp pra ela escolher pra quem mandar.
 */
export function buildWhatsappComposeLink(whatsappNumber: string | null, text: string): string {
  const query = `text=${encodeURIComponent(text)}`;
  return whatsappNumber ? `https://wa.me/${whatsappNumber}?${query}` : `https://wa.me/?${query}`;
}
