import { describe, expect, it } from 'vitest';
import { parseCommand, normalizeCommandText } from './parse.js';
import { SKILLS, findSkill, pickTip, skillToolNames } from './skills.js';
import { formatHelpOverview, formatHelpTopic, formatSkillTip } from './help.js';
import { ALL_TOOLS } from '../llm/tool-registry.js';

function emojiCount(line: string): number {
  return (line.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

describe('parseCommand', () => {
  it('normaliza acento, pontuação e saudação', () => {
    expect(normalizeCommandText('  Tom, Amanhã?! ')).toBe('amanha');
  });

  it('reconhece comandos de mensagem inteira', () => {
    expect(parseCommand('ajuda')).toEqual({ kind: 'help', topic: null });
    // "o que você faz?" é conversa (resposta de parceiro), não atalho.
    expect(parseCommand('o que você faz?')).toBeNull();
    expect(parseCommand('Ajuda listas')).toEqual({ kind: 'help', topic: 'listas' });
    expect(parseCommand('hoje')).toEqual({ kind: 'overview', period: 'today' });
    expect(parseCommand('Amanhã!')).toEqual({ kind: 'overview', period: 'tomorrow' });
    expect(parseCommand('minha semana')).toEqual({ kind: 'overview', period: 'week' });
    expect(parseCommand('tarefas')).toEqual({ kind: 'tasks' });
    expect(parseCommand('gastos')).toEqual({ kind: 'spending', period: 'month' });
    expect(parseCommand('gastos de hoje')).toEqual({ kind: 'spending', period: 'today' });
    expect(parseCommand('desfazer')).toEqual({ kind: 'undo' });
    expect(parseCommand('dica')).toEqual({ kind: 'tip' });
    expect(parseCommand('desligar resumo')).toEqual({ kind: 'digest', enabled: false });
    expect(parseCommand('ligar dicas')).toEqual({ kind: 'tips', enabled: true });
    expect(parseCommand('ligar fechamento do dia')).toEqual({ kind: 'routine', routine: 'day_close', enabled: true });
    expect(parseCommand('desligar check-ins')).toEqual({ kind: 'routine', routine: 'checkins', enabled: false });
    expect(parseCommand('fechamento do dia')).toEqual({ kind: 'run_routine', routine: 'day_close' });
  });

  it('foco com e sem minutos, respeitando limites', () => {
    expect(parseCommand('foco')).toEqual({ kind: 'focus', minutes: 25 });
    expect(parseCommand('foco 45')).toEqual({ kind: 'focus', minutes: 45 });
    expect(parseCommand('pomodoro 50 minutos')).toEqual({ kind: 'focus', minutes: 50 });
    expect(parseCommand('foco 2')).toBeNull();
    expect(parseCommand('foco 500')).toBeNull();
  });

  it('lista com conector vira list_show; texto livre não', () => {
    expect(parseCommand('lista de compras')).toEqual({ kind: 'list_show', name: 'compras' });
    expect(parseCommand('minha lista do mercado')).toEqual({ kind: 'list_show', name: 'mercado' });
    expect(parseCommand('lista de tarefas')).toEqual({ kind: 'tasks' });
    expect(parseCommand('lista os gastos de ontem')).toBeNull();
    expect(parseCommand('lista de coisas pra levar na viagem de ferias')).toBeNull();
  });

  it('frase maior com a mesma palavra NÃO vira comando', () => {
    expect(parseCommand('hoje gastei 30 no almoço')).toBeNull();
    expect(parseCommand('amanhã tenho dentista às 10')).toBeNull();
    expect(parseCommand('gastos com o carro esse mês foram altos')).toBeNull();
    expect(parseCommand('me ajuda a organizar a semana')).toBeNull();
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('x'.repeat(200))).toBeNull();
  });
});

describe('catálogo de habilidades', () => {
  it('todo nome de tool citado existe no registro', () => {
    const registered = new Set(ALL_TOOLS.map((tool) => tool.name));
    const missing = skillToolNames().filter((name) => !registered.has(name));
    expect(missing).toEqual([]);
  });

  it('ids únicos e aliases já normalizados', () => {
    expect(new Set(SKILLS.map((skill) => skill.id)).size).toBe(SKILLS.length);
    for (const skill of SKILLS) {
      for (const alias of skill.aliases) expect(normalizeCommandText(alias)).toBe(alias);
    }
  });

  it('textos respeitam 1 emoji por linha e não citam painel, preço nem teste grátis', () => {
    const texts = [formatHelpOverview(), ...SKILLS.map((skill) => formatSkillTip(skill)), ...SKILLS.map((skill) => formatHelpTopic(skill.id) ?? '')];
    for (const text of texts) {
      for (const line of text.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
      expect(text).not.toMatch(/painel|dashboard|R\$ ?27|assinatura|trial|teste gr[aá]tis|plano/i);
    }
  });

  it('visão geral cabe em 3 balões e topo de fluxo achou assunto por alias', () => {
    expect(formatHelpOverview().split(/\n\s*\n/).length).toBeLessThanOrEqual(6);
    expect(findSkill('compras')?.id).toBe('listas');
    expect(formatHelpTopic('lembrete')).toContain('Lembretes');
    expect(formatHelpTopic('assunto inexistente')).toBeNull();
  });

  it('pickTip escolhe a primeira habilidade nunca usada e não repete', () => {
    const used = new Set(['create_calendar_event', 'create_reminder']);
    const first = pickTip(used, new Set());
    expect(first).not.toBeNull();
    expect(first!.tools.some((tool) => used.has(tool))).toBe(false);
    const second = pickTip(used, new Set([first!.id]));
    expect(second?.id).not.toBe(first!.id);
    expect(pickTip(new Set(skillToolNames()), new Set())).toBeNull();
  });
});
