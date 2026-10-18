import { fetchWithRetry } from './http-retry.js';
import type { AudioRef, ConnectionCheck, WhatsappChannel } from './types.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function baseUrl(): string {
  return requireEnv('EVOLUTION_API_URL').replace(/\/$/, '');
}

function headers(): Record<string, string> {
  return { apikey: requireEnv('EVOLUTION_API_KEY'), 'Content-Type': 'application/json' };
}

function instanceName(): string {
  return requireEnv('EVOLUTION_INSTANCE_NAME');
}

/**
 * Canal opcional via Evolution API (gateway Baileys self-hosted) — ver
 * amendamento no CLAUDE.md. Nunca é o default; só para staging/contingência.
 * Mesmos endpoints usados em produção pelo ZapScript (apps/api/src/services/evolution.ts).
 */
export class EvolutionChannel implements WhatsappChannel {
  readonly provider = 'evolution' as const;

  async sendText(to: string, body: string): Promise<void> {
    const phone = to.replace(/\D/g, '');
    const response = await fetchWithRetry(
      `${baseUrl()}/message/sendText/${instanceName()}`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ number: phone, text: body }),
      },
      15_000,
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => response.statusText);
      throw new Error(`Evolution sendText falhou (${response.status}): ${errorBody}`);
    }
  }

  async downloadAudio(ref: AudioRef): Promise<{ buffer: Buffer; mimeType: string }> {
    if (ref.provider !== 'evolution') {
      throw new Error(`EvolutionChannel recebeu audioRef de provider errado: ${ref.provider}`);
    }

    const response = await fetchWithRetry(
      `${baseUrl()}/chat/getBase64FromMediaMessage/${instanceName()}`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ message: ref.raw }),
      },
      30_000,
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => response.statusText);
      throw new Error(`Evolution getBase64FromMediaMessage falhou (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { base64?: string; data?: string; mimetype?: string };
    const base64 = data.base64 ?? data.data;
    if (!base64) throw new Error('Evolution não retornou base64 do áudio');

    return { buffer: Buffer.from(base64, 'base64'), mimeType: data.mimetype ?? 'audio/ogg' };
  }

  /**
   * Evolution (Baileys) é uma sessão de WhatsApp real — pode cair sem avisar
   * (desconexão do celular, ban, etc.), diferente da Cloud API. `state ===
   * 'open'` é o único estado em que a instância está de fato conectada e
   * capaz de enviar/receber mensagem.
   */
  async checkConnection(): Promise<ConnectionCheck> {
    try {
      const response = await fetchWithRetry(
        `${baseUrl()}/instance/connectionState/${instanceName()}`,
        { headers: headers() },
        8_000,
      );
      if (!response.ok) {
        const body = await response.text().catch(() => response.statusText);
        return { ok: false, detail: `HTTP ${response.status}: ${body.slice(0, 200)}` };
      }
      const data = (await response.json()) as { instance?: { state?: string } };
      const state = data.instance?.state ?? 'desconhecido';
      return { ok: state === 'open', detail: state };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
