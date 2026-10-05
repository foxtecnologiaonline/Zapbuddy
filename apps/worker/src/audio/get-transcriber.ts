import type { AudioTranscriber } from '@zapbuddy/core';
import { WhisperTranscriber } from './whisper-transcriber.js';

class UnconfiguredTranscriber implements AudioTranscriber {
  async transcribe(): Promise<string> {
    throw new Error(
      'Nenhum provedor de transcrição configurado — defina GROQ_API_KEY e/ou OPENAI_API_KEY.',
    );
  }
}

const whisperTranscriber = new WhisperTranscriber();
const unconfiguredTranscriber = new UnconfiguredTranscriber();

/**
 * Sem cache de instância: construir qualquer um dos dois é barato (os
 * clientes OpenAI/Groq, que são a parte cara, já são memoizados dentro de
 * whisper-transcriber.ts). Reavaliar as env vars a cada chamada evita que um
 * provedor configurado após o boot do worker fique preso como "não
 * configurado" até reiniciar o processo.
 */
export function getAudioTranscriber(): AudioTranscriber {
  return process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY ? whisperTranscriber : unconfiguredTranscriber;
}
