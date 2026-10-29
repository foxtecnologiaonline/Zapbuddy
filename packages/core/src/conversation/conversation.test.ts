import { describe, expect, it } from 'vitest';
import { analyzeStyle, formatStyleBlock } from './style.js';
import { bubbleDelayMs, MAX_BUBBLES, splitIntoBubbles } from './bubbles.js';
import { isGratitudeOnly, lastAssistantAskedQuestion } from './ack.js';

describe('analyzeStyle', () => {
  it('amostra pequena não decide nada', () => {
    expect(analyzeStyle(['oi', 'tudo bem', 'gastei 10'])).toBeNull();
  });

  it('informal, curto, com emoji', () => {
    const profile = analyzeStyle(['oi tom', 'gastei 30 no mercado 😅', 'blz valeu', 'bora marcar dentista', 'vlw 🙏'])!;
    expect(profile).toMatchObject({ verbosity: 'curta', tone: 'informal', usesEmoji: true });
  });

  it('formal, mensagens maiores, sem emoji', () => {
    const profile = analyzeStyle([
      'Bom dia. Gostaria de registrar uma despesa referente ao almoço com o cliente de ontem.',
      'Poderia me informar o total dos gastos desta semana, por gentileza?',
      'Agradeço a atenção. Preciso também de um lembrete para a reunião de quinta-feira às nove horas.',
      'Obrigado. Atenciosamente.',
    ])!;
    expect(profile.tone).toBe('formal');
    expect(profile.usesEmoji).toBe(false);
  });

  it('gera orientação concreta e proíbe caricatura', () => {
    const block = formatStyleBlock(analyzeStyle(['oi', 'blz', 'vlw', 'tá bom', 'show'])!);
    expect(block).toContain('Jeito dela de escrever');
    expect(block).toMatch(/1 ou 2 frases/);
    expect(block).toMatch(/Nunca imite erro de digitação/);
    expect(formatStyleBlock(null)).toBe('');
  });
});

describe('splitIntoBubbles', () => {
  it('linha em branco separa balões; quebra simples não', () => {
    expect(splitIntoBubbles('Anotado!\n\nQuer que eu te lembre antes?')).toEqual(['Anotado!', 'Quer que eu te lembre antes?']);
    expect(splitIntoBubbles('Linha 1\nLinha 2\nLinha 3')).toEqual(['Linha 1\nLinha 2\nLinha 3']);
  });

  it('no máximo 3 balões: o excedente se junta ao último', () => {
    const bubbles = splitIntoBubbles('a\n\nb\n\nc\n\nd\n\ne');
    expect(bubbles).toHaveLength(MAX_BUBBLES);
    expect(bubbles[2]).toBe('c\n\nd\n\ne');
  });

  it('texto vazio ou só espaço não vira balão fantasma', () => {
    expect(splitIntoBubbles('  \n\n  ')).toEqual(['']);
  });

  it('pausa proporcional, com piso e teto', () => {
    expect(bubbleDelayMs('oi')).toBe(700);
    expect(bubbleDelayMs('x'.repeat(40))).toBe(1100);
    expect(bubbleDelayMs('x'.repeat(500))).toBe(2200);
  });
});

describe('agradecimento', () => {
  it('só agradecimento puro conta', () => {
    for (const text of ['valeu', 'Valeu!', 'obrigado', 'Obrigada!!', 'muito obrigado', 'vlw tom', '🙏']) expect(isGratitudeOnly(text), text).toBe(true);
    for (const text of ['ok', 'blz', '👍', 'valeu, pode marcar', 'obrigado, e amanhã?', 'sim']) expect(isGratitudeOnly(text), text).toBe(false);
  });

  it('se o Tom acabou de perguntar algo, não é hora de só reagir', () => {
    expect(lastAssistantAskedQuestion([{ role: 'assistant', content: 'Quer que eu te lembre?' }])).toBe(true);
    expect(lastAssistantAskedQuestion([{ role: 'assistant', content: 'Quer que eu te lembre? 🙂' }])).toBe(true);
    expect(lastAssistantAskedQuestion([{ role: 'assistant', content: 'Anotado!' }])).toBe(false);
    expect(lastAssistantAskedQuestion([{ role: 'assistant', content: 'Quer que eu te lembre?\nFechou, anotei!' }])).toBe(false);
    expect(lastAssistantAskedQuestion([])).toBe(false);
  });
});
