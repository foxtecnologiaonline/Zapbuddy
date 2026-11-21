import { describe, expect, it } from 'vitest';
import { MONTHLY_PRICE_CENTS, formatMonthlyPriceBRL } from '@zapbuddy/core';
import {
  FINAL_CTA,
  HERO,
  PRICE_LABEL,
  TRIAL_DAYS,
  control,
  faq,
  heroMicrocopy,
  howItWorks,
  pillars,
  pricing,
  proactive,
  type LandingFlags,
} from './content';

const OFF: LandingFlags = { billing: false, dashboard: false };
const ON: LandingFlags = { billing: true, dashboard: true };
const BILLING_ONLY: LandingFlags = { billing: true, dashboard: false };
const DASHBOARD_ONLY: LandingFlags = { billing: false, dashboard: true };

/** Todo texto visível da LP, achatado pra checagem de regra de produto. */
function allCopy(flags: LandingFlags): string {
  const how = howItWorks(flags);
  const ctl = control(flags);
  const price = pricing(flags);
  const questions = faq(flags);
  const pil = pillars(flags);
  const pro = proactive(flags);
  const parts: string[] = [
    HERO.eyebrow,
    HERO.title,
    HERO.subtitle,
    HERO.ctaLabel,
    heroMicrocopy(flags),
    pil.title,
    pil.intro,
    pro.title,
    pro.intro,
    how.title,
    ctl.title,
    ...ctl.items,
    ...pil.groups.flatMap((g) => [g.tag, g.title, ...g.items.flatMap((i) => [i.title, i.text])]),
    ...pro.items.flatMap((i) => [i.title, i.text]),
    ...how.steps.flatMap((s) => [s.title, s.text]),
    ...questions.items.flatMap((i) => [i.question, i.answer]),
    FINAL_CTA.title,
    ...HERO.chat.map((m) => m.text),
  ];
  // A seção de preço só existe com cobrança ligada.
  if (flags.billing) parts.push(price.title, price.trialLine, price.payment, ...price.includes);
  return parts.join('\n');
}

describe.each([
  ['painel e cobrança desligados', OFF],
  ['painel e cobrança ligados', ON],
  ['só cobrança ligada', BILLING_ONLY],
  ['só painel ligado', DASHBOARD_ONLY],
])('copy da LP — regras de produto (CLAUDE.md), %s', (_label, flags) => {
  const copy = allCopy(flags);

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
    for (const pattern of [/nota fiscal/gi, /\bDAS\b/g]) {
      for (const match of copy.matchAll(pattern)) {
        const idx = match.index ?? 0;
        const window = copy.slice(Math.max(0, idx - 30), idx + match[0].length + 30).toLowerCase();
        expect(window).toMatch(/não/);
      }
    }
  });

  it('o resumo matinal descrito não afirma tarefa atrasada nem janela de 3 dias (comportamento antigo)', () => {
    expect(copy).not.toMatch(/atrasadas|até 3 dias/i);
  });

  it('o emoji respeita o limite de 1 por linha nos exemplos de conversa', () => {
    const emoji = /\p{Extended_Pictographic}/gu;
    for (const message of HERO.chat) {
      for (const line of message.text.split('\n')) {
        expect((line.match(emoji) ?? []).length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('copy da LP — painel e cobrança desligados (ADR 0008)', () => {
  const copy = allCopy(OFF);

  it('não cita preço, teste, CPF nem assinatura', () => {
    expect(copy).not.toMatch(/R\$|\bteste\b|dias de teste|CPF|CNPJ|assinatura|cancelo/i);
  });

  it('não cita painel, link de acesso nem exportação', () => {
    expect(copy).not.toMatch(/painel|exporte|JSON|link de acesso/i);
  });

  it('o microcopy diz só "liberado por enquanto", sem prazo nem promessa de futuro', () => {
    expect(heroMicrocopy(OFF)).toBe('Liberado por enquanto, sem cobrança');
  });
});

describe('copy da LP — cobrança e painel ligados', () => {
  it('o preço exibido vem da fonte única do core', () => {
    expect(PRICE_LABEL).toBe(formatMonthlyPriceBRL());
    expect(MONTHLY_PRICE_CENTS).toBe(2790);
  });

  it('o microcopy do hero e a seção de preço citam o mesmo preço e o mesmo teste', () => {
    expect(heroMicrocopy(ON)).toContain(PRICE_LABEL);
    expect(pricing(ON).price).toBe(PRICE_LABEL);
    expect(heroMicrocopy(ON)).toContain(`${TRIAL_DAYS} dias`);
    expect(pricing(ON).trialLine).toContain(`${TRIAL_DAYS} dias`);
  });

  it('o teste é de 3 dias (migration 0023), não os 7 da regra antiga', () => {
    expect(TRIAL_DAYS).toBe(3);
  });

  it('menciona painel e cancelamento só quando existem', () => {
    const copy = allCopy(ON);
    expect(copy).toMatch(/painel/i);
    expect(faq(ON).items.some((i) => /cancelo/i.test(i.question))).toBe(true);
    expect(faq(OFF).items.some((i) => /cancelo/i.test(i.question))).toBe(false);
  });
});

describe('copy da LP — estrutura', () => {
  it('o CTA final repete o do hero', () => {
    expect(HERO.chat.length).toBeGreaterThan(0);
    expect(FINAL_CTA.ctaLabel).toBe(HERO.ctaLabel);
  });

  it.each([OFF, ON])('cada pergunta do FAQ tem resposta não vazia (%o)', (flags) => {
    for (const item of faq(flags).items) {
      expect(item.question.trim().length).toBeGreaterThan(0);
      expect(item.answer.trim().length).toBeGreaterThan(0);
    }
  });
});

/** Texto de um cartão/seção da LP, achatado, pra checar o que ele promete. */
const textOf = (value: unknown): string => JSON.stringify(value);

describe('copy da LP — só promete o que o estado do produto entrega (ADR 0008)', () => {
  it('sem painel não há como conectar agenda: nada de aviso de conflito, Google Agenda nem agenda conectada', () => {
    for (const flags of [OFF, BILLING_ONLY]) {
      const copy = allCopy(flags);
      expect(copy).not.toMatch(/baterem|mesmo horário|conflito|google agenda|outlook|agenda conectada/i);
      const compromissos = pillars(flags).groups[0].items.find((item) => item.title === 'Compromissos');
      expect(compromissos?.text).toMatch(/data e hora/i);
    }
  });

  it('com painel, o aviso de conflito aparece e depende de conectar o Google Agenda', () => {
    for (const flags of [ON, DASHBOARD_ONLY]) {
      const compromissos = pillars(flags).groups[0].items.find((item) => item.title === 'Compromissos');
      expect(compromissos?.text).toMatch(/google agenda/i);
      expect(compromissos?.text).toMatch(/baterem no mesmo horário/i);
    }
  });

  it('nunca cita o Outlook: a credencial do Azure ainda não existe em produção', () => {
    for (const flags of [OFF, ON, BILLING_ONLY, DASHBOARD_ONLY]) expect(allCopy(flags)).not.toMatch(/outlook|microsoft/i);
  });

  it('o resumo matinal sem painel não promete "agenda" (só tarefas e compromissos salvos como tarefa)', () => {
    const resumo = (flags: LandingFlags) => proactive(flags).items.find((item) => item.title === 'Resumo matinal')!.text;
    expect(resumo(OFF)).not.toMatch(/\bagenda\b/i);
    expect(resumo(OFF)).toMatch(/tarefas e compromissos de hoje/i);
    expect(resumo(ON)).toMatch(/a agenda e as tarefas de hoje/i);
  });

  it('sem painel não promete ver nem apagar a memória (o Tom não lista nem recebe o id dos fatos guardados)', () => {
    for (const flags of [OFF, BILLING_ONLY]) {
      expect(allCopy(flags)).not.toMatch(/vê tudo|veja o que o tom lembra|peça pro tom esquecer|apague o que/i);
      expect(textOf(control(flags))).not.toMatch(/lembra de você/i);
    }
    expect(textOf(control(ON))).toMatch(/Veja o que o Tom lembra de você/);
  });

  it('o preço lista "Agenda" só com painel; sem painel é "Compromissos"', () => {
    expect(pricing(BILLING_ONLY).includes[0]).toMatch(/^Compromissos,/);
    expect(pricing(ON).includes[0]).toMatch(/^Agenda,/);
  });
});
