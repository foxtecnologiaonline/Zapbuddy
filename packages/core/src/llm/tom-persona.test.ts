import { describe, expect, it } from 'vitest';
import { redactSensitive } from '@zapbuddy/db';
import { MONEY_KNOWLEDGE, TIME_KNOWLEDGE, buildKnowledgeSection, buildPersonalitySection } from './tom-persona.js';

const emoji = /\p{Extended_Pictographic}/gu;
const all = [...MONEY_KNOWLEDGE, ...TIME_KNOWLEDGE];
const section = buildKnowledgeSection();

describe('conhecimento de apoio', () => {
  /**
   * O que muda com o tempo (taxa, alíquota, salário mínimo, limite) o Tom NÃO recita de cabeça: busca na hora. Este teste existe
   * pra uma edição futura não colar um número velho aqui dentro e o Tom passar a afirmá-lo como fato.
   */
  it('nenhum item traz percentual nem valor em reais (número que muda com o tempo vem de busca, não de memória)', () => {
    for (const item of all) {
      expect(item, `percentual em: ${item}`).not.toMatch(/\d\s?%/);
      expect(item, `valor em reais em: ${item}`).not.toMatch(/R\$/);
      expect(item.toLowerCase(), `taxa citada em: ${item}`).not.toMatch(/\b(selic|cdi|ipca)\b.*\d/);
    }
  });

  it('nunca recomenda produto, banco, corretora nem ativo, e nunca promete rendimento', () => {
    expect(section).toMatch(/Nunca recomende produto, banco, corretora ou ativo/);
    expect(section).toMatch(/nunca prometa rendimento/);
    for (const item of all) expect(item.toLowerCase(), item).not.toMatch(/\b(nubank|itaú|itau|bradesco|santander|inter|xp|btg|tesouro direto|bitcoin|ações|acoes|fii)\b/);
  });

  it('sem item repetido, sem emoji e sem frase de atendimento', () => {
    expect(new Set(all).size).toBe(all.length);
    for (const item of all) {
      expect((item.match(emoji) ?? []).length, item).toBe(0);
      expect(item.toLowerCase(), item).not.toMatch(/prezado|estou à disposição|atenciosamente/);
    }
  });

  it('o que é pergunta dela pro Tom ("qual é a data de fechamento?") nunca é chutado: manda perguntar', () => {
    const invoice = MONEY_KNOWLEDGE.find((item) => item.startsWith('Fatura:'))!;
    expect(invoice).toMatch(/pergunte, não chute/);
  });

  it('os itens novos de dinheiro e tempo entraram, e o que dizia que não rastreia hábito saiu (agora rastreia)', () => {
    expect(section).toContain('Compra por impulso');
    expect(section).toContain('Assinaturas esquecidas');
    expect(section).toContain('Lembrete bom descreve a AÇÃO');
    expect(section).toContain('Deslocamento:');
    expect(section).not.toContain('Você não rastreia constância');
    expect(TIME_KNOWLEDGE.join(' ')).toContain('create_habit');
  });

  it('a conta de meta usa a tool de cálculo (o Tom nunca faz aritmética de cabeça)', () => {
    expect(MONEY_KNOWLEDGE.join(' ')).toMatch(/calculate, nunca de cabeça/);
  });

  it('higiene: nada de dado pessoal', () => {
    expect(redactSensitive(section)).toBe(section);
    expect(redactSensitive(buildPersonalitySection())).toBe(buildPersonalitySection());
  });

  // Entra em TODA chamada (bloco stable). Antes de crescer mais, vale conferir o custo (cache de prompt estável).
  it('cabe no orçamento: até ~2.000 tokens estimados (chars/4)', () => {
    expect(section.length).toBeLessThanOrEqual(8_000);
  });
});
