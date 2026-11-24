import { describe, expect, it } from 'vitest';
import { WHATSAPP_MAX_CHARS, splitForWhatsapp } from './split.js';

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('splitForWhatsapp', () => {
  it('o que cabe numa mensagem volta inteiro, sem mexer (inclusive o texto vazio)', () => {
    expect(splitForWhatsapp('oi')).toEqual(['oi']);
    expect(splitForWhatsapp('')).toEqual(['']);
    const exact = 'a'.repeat(WHATSAPP_MAX_CHARS);
    expect(splitForWhatsapp(exact)).toEqual([exact]);
  });

  it('nenhuma parte passa do limite e NADA do conteúdo se perde', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i}: ${'palavra '.repeat(60)}`.trim());
    const text = paragraphs.join('\n\n');
    expect(text.length).toBeGreaterThan(WHATSAPP_MAX_CHARS);

    const parts = splitForWhatsapp(text);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(WHATSAPP_MAX_CHARS);
    expect(squash(parts.join(' '))).toBe(squash(text));
  });

  it('prefere cortar em fim de parágrafo (não no meio de uma frase)', () => {
    const first = 'a'.repeat(3000);
    const second = 'b'.repeat(3000);
    const parts = splitForWhatsapp(`${first}\n\n${second}`);
    expect(parts).toEqual([first, second]);
  });

  it('sem parágrafo, corta em linha; sem linha, em frase; sem frase, em palavra', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `linha ${i} com algum texto`).join('\n');
    const byLine = splitForWhatsapp(lines);
    for (const part of byLine.slice(0, -1)) expect(part.endsWith('texto')).toBe(true);

    const sentences = 'Esta é uma frase de teste. '.repeat(300).trim();
    const bySentence = splitForWhatsapp(sentences);
    for (const part of bySentence.slice(0, -1)) expect(part.endsWith('.')).toBe(true);

    const words = 'palavra '.repeat(700).trim();
    const byWord = splitForWhatsapp(words);
    for (const part of byWord) expect(part.startsWith('palavra') && part.endsWith('palavra')).toBe(true);
  });

  it('uma "palavra" gigante sem nenhum espaço é cortada no limite, sem perder nada e sem partir emoji ao meio', () => {
    const blob = '😀'.repeat(3000); // 6.000 unidades de UTF-16, nenhum espaço
    const parts = splitForWhatsapp(blob);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(WHATSAPP_MAX_CHARS);
      expect(part).not.toMatch(/[\ud800-\udbff]$/); // não termina no meio de um par substituto
      expect(part).not.toMatch(/^[\udc00-\udfff]/);
    }
    expect(parts.join('')).toBe(blob);
  });

  it('respeita um limite customizado', () => {
    const parts = splitForWhatsapp('um dois três quatro cinco seis sete oito', 15);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(15);
    expect(squash(parts.join(' '))).toBe('um dois três quatro cinco seis sete oito');
  });
});
