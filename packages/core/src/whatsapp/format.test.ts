import { describe, expect, it } from 'vitest';
import { breakLinesAfterSentences } from './format.js';

describe('breakLinesAfterSentences', () => {
  it('quebra a linha depois de cada frase encerrada por ponto, exclamação ou interrogação', () => {
    expect(breakLinesAfterSentences('Oi! Legal, começando uma nova conversa! O que você gostaria de falar?')).toBe(
      'Oi!\nLegal, começando uma nova conversa!\nO que você gostaria de falar?',
    );
  });

  it('quebra antes de emoji que abre a frase seguinte', () => {
    expect(breakLinesAfterSentences('Fechou, 80 conto anotado. 🛒 Mais alguma coisa?')).toBe(
      'Fechou, 80 conto anotado.\n🛒 Mais alguma coisa?',
    );
  });

  it('não corta valor monetário, decimal nem domínio', () => {
    const text = 'Gastei R$ 27,90 no plano em zapbuddy.vercel.app hoje.';
    expect(breakLinesAfterSentences(text)).toBe(text);
  });

  it('não quebra abreviação comum', () => {
    expect(breakLinesAfterSentences('Falei com a Sr. Silva sobre a conta.')).toBe('Falei com a Sr. Silva sobre a conta.');
  });

  it('não mexe em linha que já é lista', () => {
    const text = '• Ligar pro contador. Sexta.\n- Pagar aluguel. Dia 5.';
    expect(breakLinesAfterSentences(text)).toBe(text);
  });

  it('preserva quebras de linha que já existem e parágrafos', () => {
    expect(breakLinesAfterSentences('Bom dia!\n\nAqui está o seu dia.')).toBe('Bom dia!\n\nAqui está o seu dia.');
  });

  it('é idempotente', () => {
    const once = breakLinesAfterSentences('Um. Dois! Três?');
    expect(breakLinesAfterSentences(once)).toBe(once);
  });
});
