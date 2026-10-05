/**
 * Interface de transcrição de áudio para gasto/receita/tarefa por voz.
 *
 * Só o tipo vive aqui — a implementação concreta (Whisper via Groq/OpenAI,
 * ver ZapScript apps/worker/src/services/whisper.ts) fica em apps/worker,
 * porque depende de ffmpeg/openai (deps pesadas que não devem ir para o
 * dashboard web). Core fica livre de peso para continuar importável tanto
 * pelo worker quanto pela app Next.js.
 */
export interface AudioTranscriber {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
