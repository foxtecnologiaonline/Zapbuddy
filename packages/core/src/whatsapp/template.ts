/**
 * Mensagem de TEMPLATE da WhatsApp Cloud API. Fora da janela de 24h desde a última mensagem da pessoa a Meta recusa texto livre
 * (erro 131047) e só aceita template pré-aprovado. É o que permite um lembrete agendado chegar mesmo pra quem não falou com o Tom
 * no último dia.
 */

/** Código de erro da Meta pra "mensagem de reengajamento": a janela de 24h fechou e só template passa. */
export const WINDOW_CLOSED_ERROR_CODE = 131047;

/** Levantado pelo canal quando a Meta recusa texto livre por janela fechada — quem chama decide se há template pra usar. */
export class WhatsappWindowClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsappWindowClosedError';
  }
}

export interface WhatsappTemplateMessage {
  name: string;
  /** Código de idioma da Meta (ex.: "pt_BR"). */
  language: string;
  /** Valores de {{1}}, {{2}}… do corpo, na ordem. */
  bodyParams: string[];
}

const MAX_PARAM_CHARS = 900;

/**
 * Parâmetro de template não aceita quebra de linha, tabulação nem 4+ espaços seguidos, e o corpo todo tem teto de ~1.024
 * caracteres. Colapsa o espaço em branco e trunca com reticências em vez de a Meta recusar o envio inteiro.
 */
export function sanitizeTemplateParam(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return '-'; // a Meta recusa parâmetro vazio
  return oneLine.length > MAX_PARAM_CHARS ? `${oneLine.slice(0, MAX_PARAM_CHARS - 1).trimEnd()}…` : oneLine;
}

/** Corpo JSON do POST /messages pra um template só com parâmetros de corpo. */
export function buildTemplatePayload(to: string, template: WhatsappTemplateMessage): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      ...(template.bodyParams.length > 0
        ? { components: [{ type: 'body', parameters: template.bodyParams.map((text) => ({ type: 'text', text: sanitizeTemplateParam(text) })) }] }
        : {}),
    },
  };
}

/** Extrai o código de erro do corpo de erro da Graph API (`{ error: { code } }`), ou null se não for JSON dessa forma. */
export function parseGraphErrorCode(errorBody: string): number | null {
  try {
    const parsed = JSON.parse(errorBody) as { error?: { code?: unknown } };
    return typeof parsed.error?.code === 'number' ? parsed.error.code : null;
  } catch {
    return null;
  }
}
