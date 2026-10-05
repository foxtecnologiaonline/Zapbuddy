/**
 * Interface de transcrição de áudio para gasto/receita/tarefa por voz (item 2 e 3 do MVP).
 *
 * O CLAUDE.md não trava um provedor de speech-to-text (só fixa Claude como LLM
 * de orquestração). Para não introduzir uma dependência de stack não decidida,
 * esta é uma interface plugável — a implementação concreta deve ser escolhida
 * e configurada via AUDIO_TRANSCRIBER_PROVIDER antes de habilitar mensagens de
 * áudio em produção. Sem configuração, falha de forma explícita (nunca inventa
 * uma transcrição).
 */
export interface AudioTranscriber {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}

class UnconfiguredTranscriber implements AudioTranscriber {
  async transcribe(): Promise<string> {
    throw new Error(
      'Nenhum provedor de transcrição de áudio configurado (AUDIO_TRANSCRIBER_PROVIDER). ' +
        'Decisão de stack pendente — ver CLAUDE.md antes de escolher um provedor.',
    );
  }
}

export function getAudioTranscriber(): AudioTranscriber {
  // Seam para plugar um provedor real (ex.: Whisper) quando a decisão for tomada.
  return new UnconfiguredTranscriber();
}
