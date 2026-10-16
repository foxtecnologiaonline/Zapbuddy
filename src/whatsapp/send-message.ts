const GRAPH_API_VERSION = 'v21.0';

export async function sendWhatsAppTextMessage(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN são obrigatórios');
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha ao enviar mensagem WhatsApp (${response.status}): ${errorBody}`);
  }
}

// Várias mensagens em sequência (ex: boas-vindas em duas bolhas), na ordem dada.
export async function sendWhatsAppTextMessages(to: string, bodies: string[]): Promise<void> {
  for (const body of bodies) {
    await sendWhatsAppTextMessage(to, body);
  }
}
