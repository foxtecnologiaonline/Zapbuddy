import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from './tool-registry.js';
import { parseCommand } from '../commands/parse.js';
import { PROPOSALS, buildProposalsSection } from './proposals.js';

const emoji = /\p{Extended_Pictographic}/gu;
const registered = new Set(ALL_TOOLS.map((tool) => tool.name));
const section = buildProposalsSection();

/** Proposição é um CONVITE: nunca afirma que algo já foi feito, nem promete lembrar sem registro. */
const DONE_OR_PROMISE = /\b(j[áa] (guardei|criei|anotei|registrei|marquei)|vou (te )?(lembrar|guardar|anotar)|fiz isso)\b/i;
const ROBOTIC = ['prezado', 'conforme solicitado', 'estou à disposição', 'como posso ajudá-lo', 'atenciosamente'];

describe('PROPOSALS — integridade do catálogo', () => {
  it('ids únicos e todos os campos preenchidos', () => {
    const ids = PROPOSALS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of PROPOSALS) {
      expect(item.when.trim().length, item.id).toBeGreaterThan(8);
      expect(item.offer.trim().length, item.id).toBeGreaterThan(8);
      expect(item.example.trim().length, item.id).toBeGreaterThan(8);
    }
  });

  it('toda proposição aponta pra uma tool que EXISTE ou pra um atalho que EXISTE (nunca promessa solta)', () => {
    for (const item of PROPOSALS) {
      expect(item.tool !== null || item.command !== undefined, `${item.id} não aponta pra nada`).toBe(true);
      if (item.tool !== null) expect(registered.has(item.tool), `${item.id}: tool "${item.tool}" não existe no registro`).toBe(true);
      if (item.command) expect(parseCommand(item.command), `${item.id}: atalho "${item.command}" não é reconhecido`).not.toBeNull();
    }
  });

  it('o exemplo é uma PERGUNTA (o "sim" dela vem antes de criar qualquer coisa), curta e sem atendimento robótico', () => {
    for (const item of PROPOSALS) {
      expect(item.example.trim().endsWith('?') || /"[^"]+"\.$/.test(item.example.trim()), `${item.id}: "${item.example}" não é pergunta`).toBe(true);
      expect(item.example.length, item.id).toBeLessThanOrEqual(150);
      for (const phrase of ROBOTIC) expect(item.example.toLowerCase(), item.id).not.toContain(phrase);
      for (const line of item.example.split('\n')) expect((line.match(emoji) ?? []).length, item.id).toBeLessThanOrEqual(1);
    }
  });

  it('nenhuma afirma que já fez algo nem promete lembrar sem registro', () => {
    for (const item of PROPOSALS) {
      expect(item.example, item.id).not.toMatch(DONE_OR_PROMISE);
      expect(item.offer, item.id).not.toMatch(DONE_OR_PROMISE);
    }
  });

  it('nenhum exemplo traz valor em reais concreto (o modelo poderia repetir como se fosse dado dela)', () => {
    for (const item of PROPOSALS) expect(item.example, item.id).not.toMatch(/R\$\s?\d/);
  });

  it('o recado a terceiros continua sendo "ela manda" (o Tom só redige — ADR 0007)', () => {
    const message = PROPOSALS.find((item) => item.id === 'aniversario-mensagem')!;
    expect(message.offer).toMatch(/quem manda é ela/);
  });

  it('"separar do salário" nunca sugere valor nem produto', () => {
    const save = PROPOSALS.find((item) => item.id === 'separar-do-salario')!;
    expect(save.offer).toMatch(/sem sugerir valor nem produto/);
  });
});

describe('buildProposalsSection — o que entra no prompt', () => {
  it('mantém as regras: uma por resposta, sempre em pergunta, nada criado sem o "sim", e quando NÃO propor', () => {
    expect(section).toContain('# Proatividade');
    expect(section).toMatch(/no máximo UMA\s+sugestão por resposta/);
    expect(section).toMatch(/nunca crie nada sem o\s+"sim"/);
    expect(section).toMatch(/Não proponha quando/);
    expect(section).toMatch(/estressada, triste ou falando de algo sério/);
    expect(section).toMatch(/recusar esse tipo de sugestão/);
  });

  it('traz todas as proposições (as 6 antigas continuam)', () => {
    for (const item of PROPOSALS) expect(section).toContain(item.example);
    for (const id of ['lembrete-antes', 'conta-recorrente', 'meta-acompanhar', 'tarefas-atrasadas', 'dia-cheio', 'plano-ou-data']) {
      expect(PROPOSALS.map((item) => item.id)).toContain(id);
    }
  });

  // Entra em TODA chamada (bloco stable). O teto existe pra o catálogo crescer de propósito.
  it('cabe no orçamento: até ~1.500 tokens estimados (chars/4), em toda chamada', () => {
    expect(section.length).toBeLessThanOrEqual(6_000);
  });
});
