import { describe, expect, it } from 'vitest';
import { matchContactByName, normalizeContactName } from './matching.js';

const contact = (name: string) => ({ name, name_normalized: normalizeContactName(name) });
const agenda = [contact('Aline Souza'), contact('Alinne Costa'), contact('João Pedro'), contact('Maria')];

describe('normalizeContactName', () => {
  it('tira acento, caixa e espaço sobrando', () => {
    expect(normalizeContactName('  JOÃO   Pedro ')).toBe('joao pedro');
  });
});

describe('matchContactByName', () => {
  it('nome exato ganha de qualquer outro nível', () => {
    expect(matchContactByName('maria', agenda)).toMatchObject({ kind: 'one', contact: { name: 'Maria' } });
  });

  it('primeiro nome único resolve', () => {
    expect(matchContactByName('Aline', agenda)).toMatchObject({ kind: 'one', contact: { name: 'Aline Souza' } });
    expect(matchContactByName('joao', agenda)).toMatchObject({ kind: 'one', contact: { name: 'João Pedro' } });
  });

  it('duas Alines no mesmo nível = ambíguo, nunca escolhe', () => {
    const result = matchContactByName('Ali', [contact('Aline Souza'), contact('Alice Lima')]);
    expect(result.kind).toBe('ambiguous');
    expect(result.kind === 'ambiguous' && result.contacts.map((c) => c.name)).toEqual(['Aline Souza', 'Alice Lima']);
  });

  it('casa por sobrenome (palavra do meio) e por trecho', () => {
    expect(matchContactByName('pedro', agenda)).toMatchObject({ kind: 'one', contact: { name: 'João Pedro' } });
    expect(matchContactByName('osta', agenda)).toMatchObject({ kind: 'one', contact: { name: 'Alinne Costa' } });
  });

  it('sem ninguém ou termo vazio = none', () => {
    expect(matchContactByName('Carlos', agenda)).toEqual({ kind: 'none' });
    expect(matchContactByName('   ', agenda)).toEqual({ kind: 'none' });
  });
});
