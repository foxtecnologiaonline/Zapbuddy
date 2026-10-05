const GRAPH_API_VERSION = 'v20.0';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export async function sendWhatsappTextMessage(to: string, body: string): Promise<void> {
  const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
  const token = requireEnv('WHATSAPP_ACCESS_TOKEN');

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${errorBody}`);
  }
}

export async function downloadWhatsappMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = requireEnv('WHATSAPP_ACCESS_TOKEN');

  const metaResponse = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaResponse.ok) throw new Error(`Failed to fetch media metadata (${metaResponse.status})`);
  const meta = (await metaResponse.json()) as { url: string; mime_type: string };

  const mediaResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaResponse.ok) throw new Error(`Failed to download media (${mediaResponse.status})`);

  const buffer = Buffer.from(await mediaResponse.arrayBuffer());
  return { buffer, mimeType: meta.mime_type };
}
