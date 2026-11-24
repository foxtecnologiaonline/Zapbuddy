/**
 * O Whisper, diante de silêncio, ruído ou áudio muito curto, costuma "alucinar" frases de legenda de vídeo ("Legendas pela comunidade
 * Amara.org", "Obrigado por assistir") em vez de devolver vazio. Sem este filtro isso chegava ao Tom como se a pessoa tivesse dito
 * isso, e ele respondia a uma frase que ninguém falou (ou, pior, agia sobre ela).
 *
 * Conservador de propósito: só barra o que é claramente lixo — vazio, só pontuação/símbolos, marcador de música e as frases de
 * legenda conhecidas, quando o áudio INTEIRO é isso. "Obrigado", "oi" e "ok" são mensagens reais e passam.
 */

const KNOWN_HALLUCINATIONS = [
  'legendas pela comunidade amara.org',
  'legendas pela comunidade',
  'legendado por',
  'amara.org',
  'obrigado por assistir',
  'obrigada por assistir',
  'obrigado por ter assistido',
  'thanks for watching',
  'thank you for watching',
  'subtitles by',
  'subtitles made by',
  'se inscreva no canal',
  'inscreva-se no canal',
  'inscreva-se',
  'deixe seu like',
  'nao se esqueca de se inscrever',
  'continue assistindo',
];

/** Acima disto o texto tem conteúdo de sobra pra ser uma fala de verdade, mesmo que cite uma dessas frases. */
const MAX_HALLUCINATION_CHARS = 80;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUnusableTranscript(transcript: string): boolean {
  const text = normalize(transcript);
  if (text.length === 0) return true;

  // Só pontuação, reticências ou símbolos ("...", "♪", "-").
  if (!/[\p{L}\p{N}]/u.test(text)) return true;

  // Marcadores de trilha que o Whisper escreve: [Música], (música), ♪ música ♪, [Aplausos].
  const stripped = text.replace(/[\[\](){}♪*_~]/g, '').replace(/[.!?…,;:-]+$/g, '').trim();
  if (['musica', 'musica de fundo', 'aplausos', 'risos', 'silencio', 'ruido', 'sound', 'music', 'applause'].includes(stripped)) return true;

  if (text.length <= MAX_HALLUCINATION_CHARS) {
    return KNOWN_HALLUCINATIONS.some((phrase) => text.includes(phrase));
  }
  return false;
}
