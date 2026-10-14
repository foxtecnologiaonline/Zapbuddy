import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync, rmdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

ffmpeg.setFfmpegPath(ffmpegPath.path);

const FFMPEG_TIMEOUT_MS = parseInt(process.env.FFMPEG_TIMEOUT_MS ?? '120000', 10);

/**
 * Roda um comando FFmpeg num diretório temporário isolado, com timeout e
 * limpeza garantidos em qualquer desfecho (sucesso, erro ou timeout).
 * `build` monta e inicia o comando (via .save()/.run()); `extract`, chamado
 * no evento 'end', lê o resultado do próprio tempDir antes de ele ser
 * removido. Compartilhado por convertToMp3 e splitMp3ByDuration — ambas só
 * diferem no comando FFmpeg e em como ler o resultado.
 */
function runFfmpegJob<T>(
  tempPrefix: string,
  inputBuffer: Buffer,
  inputExt: string,
  build: (tempIn: string, tempDir: string) => ReturnType<typeof ffmpeg>,
  extract: (tempDir: string) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tempDir: string;
    try {
      tempDir = mkdtempSync(join(tmpdir(), tempPrefix));
    } catch (err) {
      return reject(new Error(`Falha ao criar diretório temporário: ${(err as Error).message}`));
    }

    const cleanup = () => {
      try {
        for (const f of readdirSync(tempDir)) unlinkSync(join(tempDir, f));
      } catch {
        /* ignorar */
      }
      try {
        rmdirSync(tempDir);
      } catch {
        /* ignorar */
      }
    };

    const tempIn = join(tempDir, `input${inputExt}`);
    try {
      writeFileSync(tempIn, inputBuffer);
    } catch (err) {
      cleanup();
      return reject(new Error(`Falha ao gravar arquivo temporário: ${(err as Error).message}`));
    }

    let settled = false;
    const done = (err: Error | null, result?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (err) reject(err);
      else resolve(result!);
    };

    const timer = setTimeout(() => {
      try {
        command.kill('SIGKILL');
      } catch {
        /* ignorar */
      }
      done(new Error(`FFmpeg timeout após ${FFMPEG_TIMEOUT_MS / 1000}s`));
    }, FFMPEG_TIMEOUT_MS);

    const command = build(tempIn, tempDir)
      .on('end', () => {
        try {
          done(null, extract(tempDir));
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .on('error', (err: Error) => done(new Error(`FFmpeg: ${err.message}`)));
  });
}

/**
 * Converte buffer de áudio para MP3 64kbps mono (aceito pela API Whisper da
 * OpenAI/Groq). Porta direta de ZapScript (apps/worker/src/services/audio.ts)
 * — mesma lógica de arquivo-em-disco (FFmpeg precisa de seek pra detectar o
 * formato em containers como MP4/M4A/WebM), mesmos parâmetros de encoding.
 */
export function convertToMp3(inputBuffer: Buffer, inputFormat?: string): Promise<Buffer> {
  return runFfmpegJob(
    'zb-audio-',
    inputBuffer,
    inputFormat ? `.${inputFormat}` : '.bin',
    (tempIn, tempDir) =>
      ffmpeg(tempIn)
        .audioCodec('libmp3lame')
        .audioBitrate('64k')
        .audioChannels(1)
        .format('mp3')
        .save(join(tempDir, 'output.mp3')),
    (tempDir) => {
      let output: Buffer;
      try {
        output = readFileSync(join(tempDir, 'output.mp3'));
      } catch (err) {
        throw new Error(`Falha ao ler MP3 convertido: ${(err as Error).message}`);
      }
      if (output.length === 0) {
        throw new Error('FFmpeg produziu output vazio — formato de entrada não suportado');
      }
      return output;
    },
  );
}

/**
 * Estima a duração (segundos) de um MP3 produzido por convertToMp3.
 * Bitrate constante (64kbps mono CBR) → 8000 bytes/s.
 */
export function estimateMp3DurationSec(mp3Buffer: Buffer): number {
  return mp3Buffer.length / 8000;
}

/**
 * Fatia um MP3 em blocos de `chunkSec` segundos (padrão 30 min) — necessário
 * porque a API Whisper (Groq/OpenAI) recusa arquivos acima de 25 MB.
 */
export function splitMp3ByDuration(mp3Buffer: Buffer, chunkSec = 1800): Promise<Buffer[]> {
  return runFfmpegJob(
    'zb-split-',
    mp3Buffer,
    '.mp3',
    (tempIn, tempDir) => {
      const command = ffmpeg(tempIn)
        .outputOptions(['-f', 'segment', '-segment_time', String(chunkSec), '-c', 'copy', '-reset_timestamps', '1'])
        .output(join(tempDir, 'chunk_%03d.mp3'));
      command.run();
      return command;
    },
    (tempDir) => {
      let buffers: Buffer[];
      try {
        const files = readdirSync(tempDir)
          .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
          .sort();
        buffers = files.map((f) => readFileSync(join(tempDir, f)));
      } catch (err) {
        throw new Error(`Falha ao ler blocos: ${(err as Error).message}`);
      }
      if (buffers.length === 0) {
        throw new Error('FFmpeg split não produziu blocos');
      }
      return buffers;
    },
  );
}
