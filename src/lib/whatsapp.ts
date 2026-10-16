const GRAPH_API_VERSION = "v20.0";

function endpoint(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado");
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado");

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao enviar mensagem WhatsApp: ${res.status} ${await res.text()}`);
  }
}

// Ack imediato antes de qualquer processamento pesado (transcrição, IA) — performance percebida
// importa mais que performance real para quem está do outro lado do WhatsApp.
export async function sendAck(to: string, kind: "text" | "audio" = "text"): Promise<void> {
  const message = kind === "audio" ? "🎧 Ouvindo seu áudio..." : "✅ Anotado, só um instante...";
  await sendWhatsAppMessage(to, message);
}
