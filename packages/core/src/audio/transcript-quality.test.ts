import { describe, expect, it } from 'vitest';
import { isUnusableTranscript } from './transcript-quality.js';

describe('isUnusableTranscript — o que NÃO é fala (silêncio, ruído, áudio curtíssimo)', () => {
  it('vazio, só espaço, só pontuação e reticências', () => {
    for (const text of ['', '   ', '\n', '...', '…', '-', '. . .', '♪', '?!']) expect(isUnusableTranscript(text), JSON.stringify(text)).toBe(true);
  });

  it('as alucinações de legenda que o Whisper escreve diante de silêncio', () => {
    for (const text of [
      'Legendas pela comunidade Amara.org',
      'Legendas pela comunidade Amara.org.',
      'legendado por equipe x',
      'Obrigado por assistir!',
      'Obrigada por assistir.',
      'Thanks for watching!',
      'Subtitles by the Amara.org community',
      'Inscreva-se no canal',
      'Se inscreva no canal e deixe seu like',
    ]) {
      expect(isUnusableTranscript(text), text).toBe(true);
    }
  });

  it('marcadores de trilha ([Música], (aplausos), ♪ música ♪)', () => {
    for (const text of ['[Música]', '(música)', '♪ música ♪', '[Aplausos]', '[Music]', '*música*']) expect(isUnusableTranscript(text), text).toBe(true);
  });
});

describe('isUnusableTranscript — o que É fala e tem que passar', () => {
  it('mensagens reais, inclusive as curtinhas que parecem lixo mas não são', () => {
    for (const text of ['oi', 'Oi!', 'ok', 'obrigado', 'Obrigada.', 'valeu', 'sim', 'não', 'gastei 30 no mercado', 'me lembra de ligar pro João amanhã às 9', 'tarefas', 'hoje']) {
      expect(isUnusableTranscript(text), text).toBe(false);
    }
  });

  it('fala de verdade que MENCIONA uma dessas frases não é barrada (o áudio inteiro precisa ser a alucinação)', () => {
    expect(isUnusableTranscript('anota aí: preciso me inscrever no canal da escola até sexta, é pra ver as aulas de reforço do meu filho')).toBe(false);
    expect(isUnusableTranscript('me lembra de agradecer o pessoal que fez as legendas do vídeo da formatura, vou mandar uma mensagem pra eles amanhã')).toBe(false);
  });

  it('números e acentos contam como conteúdo', () => {
    expect(isUnusableTranscript('R$ 45')).toBe(false);
    expect(isUnusableTranscript('é')).toBe(false);
  });
});
