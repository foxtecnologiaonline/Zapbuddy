import { describe, expect, it } from 'vitest';
import { JOKES, JOKE_THEMES, pickJoke } from './jokes.js';
import { tellJokeTool } from './tools/jokes.js';

describe('banco de piadas', () => {
  it('ids são únicos e todo tema declarado tem piada', () => {
    const ids = JOKES.map((joke) => joke.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of JOKE_THEMES) {
      expect(JOKES.some((joke) => joke.theme === theme)).toBe(true);
    }
  });

  it('nenhuma piada é vazia nem comprida demais pra uma tela de WhatsApp', () => {
    for (const joke of JOKES) {
      expect(joke.text.trim().length).toBeGreaterThan(20);
      expect(joke.text.length).toBeLessThan(260);
    }
  });

  it('tem um banco de verdade (não meia dúzia)', () => {
    expect(JOKES.length).toBeGreaterThanOrEqual(30);
  });
});

describe('pickJoke', () => {
  it('respeita o tema pedido', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickJoke('dinheiro').theme).toBe('dinheiro');
    }
  });

  it('nunca repete uma piada já contada enquanto ainda sobra do tema', () => {
    const dinheiro = JOKES.filter((joke) => joke.theme === 'dinheiro').map((joke) => joke.id);
    const told = dinheiro.slice(1);
    for (let i = 0; i < 20; i++) {
      const picked = pickJoke('dinheiro', told);
      expect(picked.id).toBe(dinheiro[0]);
      expect(picked.repeated).toBe(false);
    }
  });

  it('quando o tema acabou, repete e avisa com repeated: true', () => {
    const all = JOKES.filter((joke) => joke.theme === 'tom').map((joke) => joke.id);
    const picked = pickJoke('tom', all);
    expect(picked.repeated).toBe(true);
    expect(all).toContain(picked.id);
  });

  it('sem tema, sorteia de todo o banco', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickJoke().theme);
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('tell_joke', () => {
  it('devolve id, tema e o texto da piada', async () => {
    const result = (await tellJokeTool.execute({ theme: 'classicas' }, {} as never)) as { id: string; theme: string; joke: string };
    expect(result.theme).toBe('classicas');
    expect(result.joke.length).toBeGreaterThan(0);
    expect(result.id).toMatch(/^cla-/);
  });
});
