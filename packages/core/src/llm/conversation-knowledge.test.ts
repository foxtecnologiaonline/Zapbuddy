import { describe, expect, it } from 'vitest';
import { redactSensitive } from '@zapbuddy/db';
import { EXPRESSIONS, SCENARIOS, SENSITIVE_TOPICS, buildConversationSection } from './conversation-knowledge.js';

const section = buildConversationSection();
const allExamples = SCENARIOS.flatMap((scenario) => scenario.examples.map((example) => ({ id: scenario.id, example })));
const emoji = /\p{Extended_Pictographic}/gu;

/** Frases de call center que o Tom não usa (a seção inteira existe pra ele soar como WhatsApp, não como atendimento). */
const ROBOTIC = ['prezado', 'conforme solicitado', 'estou à disposição', 'como posso ajudá-lo', 'como posso ajudar você hoje', 'atenciosamente', 'agradecemos o contato'];

/** Afirmações de vida humana que o Tom nunca faz: ele é uma IA e não tem rotina, família, sono nem fome. */
const HUMAN_CLAIMS = [/\b(almocei|jantei|tomei café|dormi|acordei)\b/i, /\bminha (família|esposa|mulher|marido|mãe|namorad[ao]|casa)\b/i, /\bmeu fim de semana\b/i, /\b(tô|estou) (cansad|com sono|com fome|doente)/i, /\bsou (humano|uma pessoa|gente)\b/i, /\beu também (tô|estou) (cansad|com sono)/i];

describe('conversation-knowledge — conteúdo', () => {
  it('ids únicos e todo cenário tem situação, jeito e ao menos um exemplo', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of SCENARIOS) {
      expect(scenario.when.trim().length, scenario.id).toBeGreaterThan(5);
      expect(scenario.how.trim().length, scenario.id).toBeGreaterThan(20);
      expect(scenario.examples.length, scenario.id).toBeGreaterThan(0);
    }
    expect(new Set(SENSITIVE_TOPICS.map((topic) => topic.id)).size).toBe(SENSITIVE_TOPICS.length);
  });

  it('cobre as situações que faltavam (conversa fiada, retribuir pergunta, luto, política, sobre o próprio Tom)', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    for (const required of ['tudo-bem', 'e-voce', 'como-foi-seu-dia', 'cansaco', 'boa-noticia', 'noticia-triste', 'sobre-o-tom', 'desistiu']) {
      expect(ids).toContain(required);
    }
    expect(SENSITIVE_TOPICS.map((topic) => topic.id)).toEqual(expect.arrayContaining(['politica-religiao', 'saude', 'ofensivo']));
  });

  it('exemplos são curtos, com no máximo 1 emoji por linha (regra de emoji do produto)', () => {
    for (const { id, example } of allExamples) {
      expect(example.length, `${id}: "${example}" é longo demais`).toBeLessThanOrEqual(150);
      for (const line of example.split('\n')) expect((line.match(emoji) ?? []).length, `${id}: emoji demais em "${line}"`).toBeLessThanOrEqual(1);
    }
  });

  it('nenhum exemplo soa como atendimento robótico, risada de texto ("kkk") ou piada', () => {
    for (const { id, example } of allExamples) {
      const lower = example.toLowerCase();
      for (const phrase of ROBOTIC) expect(lower, `${id} usa "${phrase}"`).not.toContain(phrase);
      expect(lower, `${id}: "kkk" é vício que o prompt já proíbe`).not.toMatch(/kkk/);
    }
  });

  it('nenhum exemplo afirma vida humana: o Tom é uma IA e não finge ter rotina, família, sono ou fome', () => {
    for (const { id, example } of allExamples) {
      for (const claim of HUMAN_CLAIMS) expect(example, `${id}: "${example}" afirma vida humana`).not.toMatch(claim);
    }
  });

  it('a honestidade sobre ser IA está nos princípios e no cenário "sobre o Tom"', () => {
    expect(section).toMatch(/Você é uma IA/);
    const aboutTom = SCENARIOS.find((scenario) => scenario.id === 'sobre-o-tom')!;
    expect(aboutTom.how).toMatch(/IA/);
    expect(aboutTom.examples.some((example) => /IA|assistente/.test(example))).toBe(true);
  });

  it('exemplos nunca trazem valor em reais concreto: o modelo poderia repeti-lo como se fosse dado real da pessoa', () => {
    for (const { id, example } of allExamples) expect(example, `${id}: "${example}" tem valor concreto`).not.toMatch(/R\$\s?\d/);
  });

  it('higiene: nada de dado pessoal no conteúdo', () => {
    expect(redactSensitive(section)).toBe(section);
  });

  it('listas de expressões não repetem palavra dentro de cada grupo', () => {
    for (const [group, words] of Object.entries(EXPRESSIONS)) expect(new Set(words).size, group).toBe(words.length);
  });
});

describe('buildConversationSection — o que entra no prompt', () => {
  it('traz princípios, situações, expressões e assuntos delicados', () => {
    expect(section).toContain('# Conversa natural');
    expect(section).toContain('Situações comuns');
    expect(section).toContain('Português que você entende');
    expect(section).toContain('Assuntos delicados');
    for (const scenario of SCENARIOS) expect(section).toContain(scenario.examples[0]!);
  });

  it('o Tom não vira "tagarela": conversa não cria tarefa e pedido vem antes do papo', () => {
    expect(section).toMatch(/Conversa não é pedido/);
    expect(section).toMatch(/faça o pedido primeiro/);
  });

  // Entra em TODA chamada (bloco stable). O teto existe pra o conteúdo crescer de propósito, não por inércia.
  // Teto subiu de 8.000 pra 11.500 (2026-11) de propósito: +10 situações novas (ansiedade antes de evento, opinião, privacidade,
  // "consegue?", voltar depois de sumir, parar mensagens, sonho/plano, curiosidade de gasto, "esqueci" e adiar lembrete). Cache de prompt estável:
  // o custo extra é só na escrita do cache; a leitura segue a ~10% do preço.
  it('cabe no orçamento: até ~2.875 tokens estimados (chars/4), em toda chamada', () => {
    expect(section.length).toBeLessThanOrEqual(11_500);
  });

  it('as situações novas existem e cada uma aponta pra uma ação real (tool ou atalho), nunca promessa solta', () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    for (const required of ['ansiedade-evento', 'pedir-opiniao', 'sonho-ou-plano', 'curiosidade-gasto', 'esqueci', 'consegue-fazer', 'privacidade', 'voltou', 'parar-mensagens', 'adiar-lembrete']) {
      expect(ids, required).toContain(required);
    }
    expect(SCENARIOS.find((scenario) => scenario.id === 'parar-mensagens')!.how).toContain('set_morning_digest_preferences');
    expect(SCENARIOS.find((scenario) => scenario.id === 'curiosidade-gasto')!.how).toContain('get_financial_summary');
  });

  it('"adiar lembrete" cria um lembrete NOVO com a mesma mensagem (o que disparou não se edita) usando a tool que existe', () => {
    const postpone = SCENARIOS.find((scenario) => scenario.id === 'adiar-lembrete')!;
    expect(postpone.how).toContain('create_reminder');
    expect(postpone.how).toMatch(/lembrete NOVO/);
    expect(postpone.how).toMatch(/MESMA mensagem/);
  });

  it('privacidade: não afirma criptografia, certificação nem prazo de retenção (não dá pra garantir) e remete a conta à equipe', () => {
    const privacy = SCENARIOS.find((scenario) => scenario.id === 'privacidade')!;
    expect(privacy.how).toMatch(/Não afirme criptografia, certificação nem prazo de retenção/);
    expect(privacy.how).toMatch(/equipe do ZapBuddy/);
    for (const example of privacy.examples) expect(example).not.toMatch(/criptograf|lgpd|iso ?27001|100% seguro|totalmente seguro/i);
  });

  it('"voltou": nunca diz que sentiu falta (é uma IA)', () => {
    const back = SCENARIOS.find((scenario) => scenario.id === 'voltou')!;
    expect(back.how).toMatch(/sem dizer que sentiu falta/);
    for (const example of back.examples) expect(example.toLowerCase()).not.toContain('senti sua falta');
  });
});
