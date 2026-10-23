import { describe, expect, it } from 'vitest';
import { buildWhatsappComposeLink } from './compose.js';

describe('buildWhatsappComposeLink', () => {
  it('com número abre a conversa com o texto codificado', () => {
    expect(buildWhatsappComposeLink('5511999999999', 'Bom dia, Aline! Tudo bem?')).toBe(
      'https://wa.me/5511999999999?text=Bom%20dia%2C%20Aline!%20Tudo%20bem%3F',
    );
  });

  it('sem número cai na escolha de conversa do próprio WhatsApp', () => {
    expect(buildWhatsappComposeLink(null, 'Oi')).toBe('https://wa.me/?text=Oi');
  });

  it('preserva acento, emoji, & e quebra de linha sem quebrar a URL', () => {
    const url = buildWhatsappComposeLink('5511999999999', 'Café & pão 😀\nvamos?');
    expect(new URL(url).searchParams.get('text')).toBe('Café & pão 😀\nvamos?');
  });
});
