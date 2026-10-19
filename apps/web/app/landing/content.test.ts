import { describe, expect, it } from 'vitest';
import { MONTHLY_PRICE_CENTS, formatMonthlyPriceBRL } from '@zapbuddy/core';
import { CONTROL, FAQ, FINAL_CTA, HERO, HOW_IT_WORKS, PILLARS, PRICING, PROACTIVE, PRICE_LABEL } from './content';

/** Todo texto visível da LP, achatado pra checagem de regra de produto. */
function allCopy(): string {
  const parts: string[] = [
    HERO.eyebrow,
    HERO.title,
    HERO.subtitle,
    HERO.ctaLabel,
    HERO.microcopy,
    PILLARS.title,
    PILLARS.intro,
    PROACTIVE.title,
    PROACTIVE.intro,
    HOW_IT_WORKS.title,
    CONTROL.title,
    PRICING.title,
    PRICING.trialLine,
    PRICING.payment,
    ...CONTROL.items,
    ...PRICING.includes,
    ...PILLARS.groups.flatMap((g) => [g.tag, g.title, ...g.items.flatMap((i) => [i.title, i.text])]),
    ...PROACTIVE.items.flatMap((i) => [i.title, i.text]),
    ...HOW_IT_WORKS.steps.flatMap((s) => [s.title, s.text]),
    ...FAQ.items.flatMap((i) => [i.question, i.answer]),
    FINAL_CTA.title,
    ...HERO.chat.map((m) => m.text),
  ];
  return parts.join('\n');
}

describe('copy da LP — regras de produto (CLAUDE.md)', () => {
  const copy = allCopy();

  it('não promete Open Finance nem conexão bancária', () => {
    expect(copy).not.toMatch(/open finance/i);
    expect(copy).not.toMatch(/(?<!não )conect\w* (na|à|a) sua (conta|banco)/i);
  });

  it('não promete rendimento sobre dinheiro', () => {
    expect(copy).not.toMatch(/rendimento|rende \d|rentabilidade|lucro garantido/i);
  });

  it('não usa prova social inventada', () => {
    expect(copy).not.toMatch(/depoimento|avaliaç(ão|ões) de|mil (clientes|usuários)|milhares de/i);
  });

  it('não usa urgência fabricada', () => {
    expect(copy).not.toMatch(/últimas vagas|só hoje|acaba (hoje|em)|oferta por tempo/i);
  });

  it('não promete cancelamento com um clique (hoje é tratado por um humano)', () => {
    expect(copy).not.toMatch(/cancel\w* (com|em) (um|1) (clique|toque)/i);
  });

  it('não vende nota fiscal nem DAS como função, só nega', () => {
    const terms = [/nota fiscal/gi, /\bDAS\b/g];
    for (const pattern of terms) {
      for (const match of copy.matchAll(pattern)) {
        const idx = match.index ?? 0;
        const window = copy.slice(Math.max(0, idx - 30), idx + match[0].length + 30).toLowerCase();
        expect(window).toMatch(/não/);
      }
    }
  });
});

describe('copy da LP — preço e trial', () => {
  it('o preço exibido vem da fonte única do core', () => {
    expect(PRICE_LABEL).toBe(formatMonthlyPriceBRL());
    expect(MONTHLY_PRICE_CENTS).toBe(2790);
  });

  it('o microcopy do hero e a seção de preço citam o mesmo preço', () => {
    expect(HERO.microcopy).toContain(PRICE_LABEL);
    expect(PRICING.price).toBe(PRICE_LABEL);
  });

  it('o trial aparece com a duração de 7 dias', () => {
    expect(HERO.microcopy).toContain('7 dias');
    expect(PRICING.trialLine).toContain('7 dias');
  });
});

describe('copy da LP — estrutura', () => {
  it('a mensagem pré-preenchida é o gatilho de onboarding, não um comando', () => {
    expect(HERO.chat.length).toBeGreaterThan(0);
    expect(FINAL_CTA.ctaLabel).toBe(HERO.ctaLabel);
  });

  it('cada pergunta do FAQ tem resposta não vazia', () => {
    for (const item of FAQ.items) {
      expect(item.question.trim().length).toBeGreaterThan(0);
      expect(item.answer.trim().length).toBeGreaterThan(0);
    }
  });
});
