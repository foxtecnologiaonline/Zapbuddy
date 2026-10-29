import { fetchWithRetry } from './http-retry.js';
import type { ConnectionCheck, MediaRef, WhatsappChannel } from './types.js';

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

  /** Melhor esforço: formato do sendPresence varia por versão da Evolution; falha é engolida. Reação não é suportada aqui (o id da mensagem recebida não é garantido) — o chamador manda texto curto. */
  async sendTyping(to: string, _waMessageId: string): Promise<void> {
    try {
      await fetchWithRetry(
        `${baseUrl()}/chat/sendPresence/${instanceName()}`,
        { method: 'POST', headers: headers(), body: JSON.stringify({ number: to.replace(/\D/g, ''), delay: 1200, presence: 'composing' }) },
        4_000,
      );
    } catch {
      // Enfeite.
    }
  }

  async downloadMedia(ref: MediaRef): Promise<{ buffer: Buffer; mimeType: string }> {
    if (ref.provider !== 'evolution') {
      throw new Error(`EvolutionChannel recebeu mediaRef de provider errado: ${ref.provider}`);
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

    return { buffer: Buffer.from(base64, 'base64'), mimeType: data.mimetype ?? 'application/octet-stream' };
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
      const number = await this.fetchConnectedNumber().catch(() => undefined);
      return { ok: state === 'open', detail: state, number };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Essa Evolution API é compartilhada com o ZapScript (ver
   * deploy/evolution/REUSE-ZAPSCRIPT-INSTANCE.md) — `fetchInstances` sem
   * filtro devolveria instâncias de outros números/clientes. Filtra pelo
   * query param E de novo no array devolvido, pra nunca exibir no admin um
   * número que não seja o da própria instância do ZapBuddy. Formato de
   * resposta varia por versão da Evolution API (objeto `instance` aninhado
   * vs. campos no topo) — tenta os dois antes de desistir.
   */
  private async fetchConnectedNumber(): Promise<string | undefined> {
    const response = await fetchWithRetry(
      `${baseUrl()}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName())}`,
      { headers: headers() },
      8_000,
    );
    if (!response.ok) return undefined;

    const data = (await response.json()) as unknown;
    const list = Array.isArray(data) ? data : [data];
    type InstanceEntry = { name?: string; instanceName?: string; ownerJid?: string; owner?: string; number?: string; instance?: { instanceName?: string; owner?: string; ownerJid?: string; number?: string } };
    const entry = (list as InstanceEntry[]).find(
      (item) => (item.name ?? item.instanceName ?? item.instance?.instanceName) === instanceName(),
    );
    if (!entry) return undefined;

    const jidOrNumber = entry.ownerJid ?? entry.owner ?? entry.number ?? entry.instance?.ownerJid ?? entry.instance?.owner ?? entry.instance?.number;
    if (!jidOrNumber) return undefined;

    const digits = (jidOrNumber.split('@')[0] ?? '').replace(/\D/g, '');
    return digits || undefined;
  }
}

export interface EvolutionInstanceStatus {
  /** false só quando a Evolution confirma que a instância não existe (404) — qualquer outra resposta assume que existe. */
  exists: boolean;
  state?: string;
  detail?: string;
}

/**
 * Diferencia "instância não existe" (precisa criar) de "existe mas
 * desconectada" (precisa reconectar) — connectionState devolve 404 só no
 * primeiro caso. Usado pela página de gestão do WhatsApp no admin pra
 * decidir se mostra "Criar instância" ou "Gerar QR code"/"Excluir".
 */
export async function evolutionGetInstanceStatus(): Promise<EvolutionInstanceStatus> {
  try {
    const response = await fetchWithRetry(`${baseUrl()}/instance/connectionState/${instanceName()}`, { headers: headers() }, 8_000);
    if (response.status === 404) return { exists: false };
    if (!response.ok) {
      const body = await response.text().catch(() => response.statusText);
      return { exists: true, detail: `HTTP ${response.status}: ${body.slice(0, 200)}` };
    }
    const data = (await response.json()) as { instance?: { state?: string } };
    return { exists: true, state: data.instance?.state };
  } catch (error) {
    return { exists: true, detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Cria a instância de EVOLUTION_INSTANCE_NAME com o mesmo payload de
 * deploy/evolution/create-instance.sh, webhook já registrado apontando pro
 * endpoint do ZapBuddy. Lança em erro (nunca chamado em caminho silencioso,
 * diferente dos checks de status) — quem chama decide como mostrar.
 */
export async function evolutionCreateInstance(): Promise<{ qrCodeBase64?: string }> {
  const webhookUrl = `${requireEnv('WEB_APP_URL').replace(/\/$/, '')}/api/whatsapp/webhook-evolution?secret=${requireEnv('EVOLUTION_WEBHOOK_SECRET')}`;

  const response = await fetchWithRetry(
    `${baseUrl()}/instance/create`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        instanceName: instanceName(),
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        rejectCall: false,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
        webhook: { url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
      }),
    },
    15_000,
  );
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Evolution instance/create falhou (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as { qrcode?: { base64?: string } };
  return { qrCodeBase64: data.qrcode?.base64 };
}

/** QR code pra pareamento — vida curta (segundos), renderizar e escanear imediatamente após chamar. */
export async function evolutionGetQrCode(): Promise<string | undefined> {
  const response = await fetchWithRetry(`${baseUrl()}/instance/connect/${instanceName()}`, { headers: headers() }, 10_000);
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Evolution instance/connect falhou (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as { base64?: string };
  return data.base64;
}

/**
 * Apaga a instância — sempre a de EVOLUTION_INSTANCE_NAME, nunca um nome
 * vindo de fora. Essa Evolution é compartilhada com o ZapScript (ver
 * deploy/evolution/REUSE-ZAPSCRIPT-INSTANCE.md); não aceitar instanceName
 * como parâmetro é o que garante que esta função nunca possa apagar a
 * instância de outro número/cliente.
 */
export async function evolutionDeleteInstance(): Promise<void> {
  const response = await fetchWithRetry(`${baseUrl()}/instance/delete/${instanceName()}`, { method: 'DELETE', headers: headers() }, 10_000);
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Evolution instance/delete falhou (${response.status}): ${body.slice(0, 300)}`);
  }
}

/** Nome da instância configurada — só leitura, pra admin confirmar antes de excluir. */
export function evolutionConfiguredInstanceName(): string | undefined {
  return process.env.EVOLUTION_INSTANCE_NAME;
}
