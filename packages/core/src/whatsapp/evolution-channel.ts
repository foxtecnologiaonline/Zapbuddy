import type { AudioRef, WhatsappChannel } from './types.js';

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
    const response = await fetch(`${baseUrl()}/message/sendText/${instanceName()}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ number: phone, text: body }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => response.statusText);
      throw new Error(`Evolution sendText falhou (${response.status}): ${errorBody}`);
    }
  }

  async downloadAudio(ref: AudioRef): Promise<{ buffer: Buffer; mimeType: string }> {
    if (ref.provider !== 'evolution') {
      throw new Error(`EvolutionChannel recebeu audioRef de provider errado: ${ref.provider}`);
    }

    const response = await fetch(`${baseUrl()}/chat/getBase64FromMediaMessage/${instanceName()}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ message: ref.raw }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => response.statusText);
      throw new Error(`Evolution getBase64FromMediaMessage falhou (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { base64?: string; data?: string; mimetype?: string };
    const base64 = data.base64 ?? data.data;
    if (!base64) throw new Error('Evolution não retornou base64 do áudio');

    return { buffer: Buffer.from(base64, 'base64'), mimeType: data.mimetype ?? 'audio/ogg' };
  }
}
