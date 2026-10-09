import OpenAI from 'openai';
import type { AudioTranscriber } from '@zapbuddy/core';
import { convertToMp3, estimateMp3DurationSec, splitMp3ByDuration } from './convert.js';

// ── Clientes Whisper ─────────────────────────────────────────────────────────
// Mesma cadeia de provedores do ZapScript (apps/worker/src/services/whisper.ts):
// Groq primeiro (whisper-large-v3-turbo — mais rápido e preciso em PT-BR,
// compatível com a API da OpenAI), OpenAI whisper-1 como fallback.
// Memoizados — a chave de API não muda em runtime, e áudio longo chama isto
// uma vez por bloco (até vários blocos por nota de voz).
let openAiClient: OpenAI | null | undefined;
function getOpenAiClient(): OpenAI | null {
  if (openAiClient === undefined) {
    openAiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }
  return openAiClient;
}

let groqClient: OpenAI | null | undefined;
function getGroqClient(): OpenAI | null {
  if (groqClient === undefined) {
    groqClient = process.env.GROQ_API_KEY
      ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
      : null;
  }
  return groqClient;
}

// O prompt do Whisper NÃO é uma instrução — é uma amostra de estilo que
// orienta vocabulário/formatação. Frases imperativas causam alucinação
// (o modelo "preenche" com o texto do prompt em áudio silencioso/ruim).
const PT_BR_PROMPT = 'Tá bom, então. Deixa eu te falar uma coisa.';

/**
 * Detecta alucinação do Whisper (prompt repetido, saída implausível para a
 * duração, repetição patológica). Heurística herdada do ZapScript — trade-off
 * intencional: pode rejeitar uma transcrição curta legítima (ex.: frase curta
 * após pausa longa) como falso positivo, mas preferimos pedir ao usuário para
 * repetir/digitar a arriscar persistir um valor financeiro alucinado (ver
 * regra não-negociável no CLAUDE.md).
 */
export function isWhisperHallucination(text: string, durationSec: number): boolean {
  if (!text || text.length < 3) return true;

  const HALLUCINATION_PATTERNS = [
    /reproduzir exatamente o que foi dito/i,
    /conversão literal e fiel/i,
    /conversão em português brasileiro/i,
    /sem correções ou omissões/i,
    /thank you for watching/i,
    /thanks for watching/i,
    /please subscribe/i,
  ];
  if (HALLUCINATION_PATTERNS.some((p) => p.test(text))) return true;

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const minWords = Math.floor(durationSec / 60) * 2;
  if (durationSec > 30 && wordCount < Math.max(minWords, 3)) return true;

  const maxPlausibleWords = Math.max(8, durationSec * 6);
  if (wordCount > maxPlausibleWords) return true;

  if (wordCount >= 8) {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const unique = new Set(words).size;
    if (unique / words.length < 0.35) return true;
  }

  return false;
}

async function runWhisper(
  client: OpenAI,
  model: string,
  audioFile: File,
  prompt: string | undefined,
  temperature: number,
): Promise<{ text: string; durationSec: number }> {
  const result = (await client.audio.transcriptions.create({
    file: audioFile,
    model,
    response_format: 'verbose_json',
    temperature,
    ...(prompt ? { prompt } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as any;
  const text = result.text?.trim();
  if (!text) throw new Error('Whisper retornou texto vazio');
  return { text, durationSec: Math.max(1, Math.round(result.duration ?? 0)) };
}

const AUDIO_CHUNK_SEC = parseInt(process.env.AUDIO_CHUNK_SEC ?? '1800', 10);

/**
 * Converte um bloco (≤ limite da API) com cadeia de recuperação em vez de
 * falha imediata: Groq+prompt → Groq sem prompt (recupera alucinação por
 * priming/silêncio) → OpenAI+prompt → OpenAI sem prompt. Primeira tentativa
 * que passa no detector de alucinação vence.
 */
async function transcribeBuffer(mp3Buffer: Buffer): Promise<{ text: string; durationSec: number }> {
  const audioFile = new File([mp3Buffer], 'audio.mp3', { type: 'audio/mpeg' });

  type Attempt = { label: string; client: OpenAI; model: string; prompt?: string; temperature: number };
  const attempts: Attempt[] = [];
  const groq = getGroqClient();
  const openai = getOpenAiClient();
  if (groq) {
    attempts.push({ label: 'Groq', client: groq, model: 'whisper-large-v3-turbo', prompt: PT_BR_PROMPT, temperature: 0 });
    attempts.push({ label: 'Groq+recovery', client: groq, model: 'whisper-large-v3-turbo', temperature: 0.2 });
  }
  if (openai) {
    attempts.push({ label: 'OpenAI', client: openai, model: 'whisper-1', prompt: PT_BR_PROMPT, temperature: 0 });
    attempts.push({ label: 'OpenAI+recovery', client: openai, model: 'whisper-1', temperature: 0.2 });
  }
  if (attempts.length === 0) {
    throw new Error('Nenhum provedor Whisper configurado (GROQ_API_KEY / OPENAI_API_KEY)');
  }

  let lastErr: Error | null = null;
  for (const a of attempts) {
    try {
      const r = await runWhisper(a.client, a.model, audioFile, a.prompt, a.temperature);
      if (isWhisperHallucination(r.text, r.durationSec)) {
        throw new Error('alucinação detectada (prompt/silêncio)');
      }
      return r;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error(`Transcrição falhou após ${attempts.length} tentativa(s): ${lastErr?.message}`);
}

/** Fatia áudios longos (> AUDIO_CHUNK_SEC) e concatena o texto — ver splitMp3ByDuration. */
async function transcribeAudioMp3(mp3Buffer: Buffer): Promise<string> {
  const estDur = estimateMp3DurationSec(mp3Buffer);
  if (estDur <= AUDIO_CHUNK_SEC + 60) {
    return (await transcribeBuffer(mp3Buffer)).text;
  }

  const chunks = await splitMp3ByDuration(mp3Buffer, AUDIO_CHUNK_SEC);
  let fullText = '';
  for (const chunk of chunks) {
    const r = await transcribeBuffer(chunk);
    fullText += (fullText ? ' ' : '') + r.text;
    chunk.fill(0);
  }
  return fullText.trim();
}

const AUDIO_FORMAT_BY_MIME: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/amr': 'amr',
};

// 10 min é generoso pra qualquer nota de voz de WhatsApp sobre gasto/tarefa —
// isto é um teto de custo (cada minuto extra é tempo de API Whisper pago),
// não um limite que se espera bater no uso normal.
const MAX_AUDIO_DURATION_SEC = parseInt(process.env.MAX_AUDIO_DURATION_SEC ?? '600', 10);

/** Erro permanente (não-transitório) — o handler não deve deixar o BullMQ tentar de novo pra isto. */
export class AudioTooLongError extends Error {
  constructor(durationSec: number) {
    super(`Áudio de ${Math.round(durationSec / 60)}min excede o limite de ${MAX_AUDIO_DURATION_SEC / 60}min`);
    this.name = 'AudioTooLongError';
  }
}

/** Implementação real do canal de transcrição — ver packages/core/src/audio/transcriber.ts para a interface. */
export class WhisperTranscriber implements AudioTranscriber {
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const format = AUDIO_FORMAT_BY_MIME[mimeType.split(';')[0]?.trim() ?? ''];
    const mp3Buffer = await convertToMp3(audioBuffer, format);

    const durationSec = estimateMp3DurationSec(mp3Buffer);
    if (durationSec > MAX_AUDIO_DURATION_SEC) {
      throw new AudioTooLongError(durationSec);
    }

    return transcribeAudioMp3(mp3Buffer);
  }
}
