import { fetchWithRetry } from './http-retry.js';
import type { ConnectionCheck, MediaRef, WhatsappChannel } from './types.js';

const GRAPH_API_VERSION = 'v20.0';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/** Canal padrão e obrigatório para produção — WhatsApp Cloud API oficial (Meta). */
export class CloudApiChannel implements WhatsappChannel {
  readonly provider = 'cloud-api' as const;

  async sendText(to: string, body: string): Promise<void> {
    const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
    const token = requireEnv('WHATSAPP_ACCESS_TOKEN');

    const response = await fetchWithRetry(
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
      15_000,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`WhatsApp send failed (${response.status}): ${errorBody}`);
    }
  }

  async downloadMedia(ref: MediaRef): Promise<{ buffer: Buffer; mimeType: string }> {
    if (ref.provider !== 'cloud-api') {
      throw new Error(`CloudApiChannel recebeu mediaRef de provider errado: ${ref.provider}`);
    }
    const token = requireEnv('WHATSAPP_ACCESS_TOKEN');

    const metaResponse = await fetchWithRetry(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${ref.mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } },
      10_000,
    );
    if (!metaResponse.ok) throw new Error(`Failed to fetch media metadata (${metaResponse.status})`);
    const meta = (await metaResponse.json()) as { url: string; mime_type: string };

    const mediaResponse = await fetchWithRetry(
      meta.url,
      { headers: { Authorization: `Bearer ${token}` } },
      30_000,
    );
    if (!mediaResponse.ok) throw new Error(`Failed to download media (${mediaResponse.status})`);

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    return { buffer, mimeType: meta.mime_type };
  }

  /**
   * Cloud API não tem "conexão" (é HTTPS stateless, sempre no ar do lado da
   * Meta) — o que pode estar errado é token/número configurados. Chamar o
   * próprio phone_number_id com o token é o jeito mais direto de validar os
   * dois numa só requisição.
   */
  async checkConnection(): Promise<ConnectionCheck> {
    try {
      const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
      const token = requireEnv('WHATSAPP_ACCESS_TOKEN');

      const response = await fetchWithRetry(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=verified_name,display_phone_number`,
        { headers: { Authorization: `Bearer ${token}` } },
        8_000,
      );
      if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        return { ok: false, detail: `HTTP ${response.status}: ${body.slice(0, 200)}` };
      }
      const data = (await response.json()) as { verified_name?: string; display_phone_number?: string };
      return { ok: true, detail: data.verified_name, number: data.display_phone_number?.replace(/\D/g, '') };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
