import { describe, expect, it } from 'vitest';
import { isWhisperHallucination } from './whisper-transcriber.js';

describe('isWhisperHallucination', () => {
  it('aceita uma transcrição plausível', () => {
    expect(isWhisperHallucination('Gastei 35 reais no almoço hoje', 8)).toBe(false);
  });

  it('rejeita texto vazio ou quase vazio', () => {
    expect(isWhisperHallucination('', 10)).toBe(true);
    expect(isWhisperHallucination('a', 10)).toBe(true);
  });

  it('rejeita padrões conhecidos de alucinação do Whisper', () => {
    expect(isWhisperHallucination('Thank you for watching!', 10)).toBe(true);
    expect(isWhisperHallucination('Reproduzir exatamente o que foi dito.', 10)).toBe(true);
  });

  it('rejeita texto implausivelmente curto pra uma duração longa', () => {
    // > 30s de áudio só produzindo 1-2 palavras é suspeito.
    expect(isWhisperHallucination('ok', 120)).toBe(true);
  });

  it('não rejeita resposta curta legítima em áudio curto', () => {
    // Duração <= 30s não aciona o piso de palavras mínimas.
    expect(isWhisperHallucination('Socorro!', 5)).toBe(false);
  });

  it('rejeita densidade de palavras implausível (alucinação clássica em silêncio/ruído)', () => {
    const manyWords = new Array(60).fill('palavra').join(' ');
    expect(isWhisperHallucination(manyWords, 2)).toBe(true);
  });

  it('rejeita repetição patológica da mesma palavra', () => {
    const repeated = new Array(20).fill('obrigado').join(' ');
    expect(isWhisperHallucination(repeated, 15)).toBe(true);
  });
});
