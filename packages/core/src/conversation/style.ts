/**
 * Espelhar o jeito da pessoa escrever (puro, sem LLM): porte das mensagens,
 * registro (informal/neutro/formal) e uso de emoji. Gera um bloco curto pro
 * prompt — o Tom passa a soar como alguém que conversa com ELA, não com "um
 * usuário". Só entra depois de algumas mensagens (amostra pequena engana).
 */
export interface StyleProfile {
  messages: number;
  verbosity: 'curta' | 'media' | 'longa';
  tone: 'informal' | 'neutro' | 'formal';
  usesEmoji: boolean;
}

export const MIN_MESSAGES_FOR_STYLE = 4;

const INFORMAL_MARKERS =
  /\b(vc|vcs|blz|tb|tbm|pq|pra|pro|ne|né|kk+|rs+|opa|eai|mano|cara|valeu|vlw|ta|tá|bora|massa|beleza|brigadao|show|top|fala)\b|k{3,}|haha+/i;
const FORMAL_MARKERS = /\b(prezado|prezada|senhor|senhora|por gentileza|poderia|gostaria|atenciosamente|cordialmente|agradeco|agradeço)\b/i;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function analyzeStyle(userMessages: string[]): StyleProfile | null {
  const messages = userMessages.map((m) => m.trim()).filter(Boolean);
  if (messages.length < MIN_MESSAGES_FOR_STYLE) return null;

  const avgWords = messages.reduce((sum, m) => sum + Math.min(wordCount(m), 60), 0) / messages.length;
  const verbosity = avgWords < 6 ? 'curta' : avgWords <= 18 ? 'media' : 'longa';

  const informalHits = messages.filter((m) => INFORMAL_MARKERS.test(m)).length;
  const formalHits = messages.filter((m) => FORMAL_MARKERS.test(m)).length;
  const lowercaseStarts = messages.filter((m) => /^[a-zà-ú]/.test(m)).length;
  const tone =
    formalHits >= 2 || (formalHits >= 1 && informalHits === 0)
      ? 'formal'
      : informalHits >= 2 || informalHits / messages.length >= 0.3 || lowercaseStarts / messages.length >= 0.8
        ? 'informal'
        : 'neutro';

  const withEmoji = messages.filter((m) => /\p{Extended_Pictographic}/u.test(m)).length;
  return { messages: messages.length, verbosity, tone, usesEmoji: withEmoji / messages.length >= 0.25 };
}

const TONE_RULE: Record<StyleProfile['tone'], string> = {
  informal: 'escreve solto, informal — pode usar contrações e um tom descontraído (gíria só leve)',
  neutro: 'escreve de forma neutra — mantenha o tom caloroso e direto de sempre',
  formal: 'escreve de forma mais formal — suba um degrau de cuidado e sem gíria nem intimidade que ela não usou',
};

const VERBOSITY_RULE: Record<StyleProfile['verbosity'], string> = {
  curta: 'manda mensagens curtas — responda em 1 ou 2 frases, sem rodeio',
  media: 'manda mensagens de tamanho médio — 2 ou 3 frases bastam',
  longa: 'se estende nas mensagens — pode explicar um pouco mais, ainda sem virar texto longo',
};

export function formatStyleBlock(profile: StyleProfile | null): string {
  if (!profile) return '';
  const emoji = profile.usesEmoji ? 'Ela usa emoji: pode usar à vontade, no seu jeito.' : 'Ela quase não usa emoji: use pouco (um de vez em quando, só quando casar muito bem).';
  return `

# Jeito dela de escrever (espelhe, sem imitar demais)

Ela ${TONE_RULE[profile.tone]}; ${VERBOSITY_RULE[profile.verbosity]}. ${emoji} Nunca imite erro de digitação nem exagere na gíria — é sintonia, não caricatura.`;
}
