import { SKILLS, findSkill, type Skill } from './skills.js';
import { normalizeCommandText } from './parse.js';

/**
 * Textos do "ajuda" e da dica semanal. Fixos (sem LLM), com no máximo 1 emoji
 * por linha e separados por linha em branco em até 3 mensagens curtas (o envio
 * em balões quebra nas linhas em branco).
 */

const OVERVIEW_GROUPS: Array<{ title: string; ids: string[] }> = [
  { title: 'Seu tempo', ids: ['agenda', 'lembretes', 'planejar', 'foco'] },
  { title: 'Suas coisas', ids: ['tarefas', 'listas', 'notas', 'metas', 'habitos', 'datas'] },
  { title: 'Seu dinheiro', ids: ['gastos', 'parcelas', 'calculos'] },
];

function skillLine(skill: Skill): string {
  return `${skill.emoji} ${skill.title}: ${skill.blurb}`;
}

/** Visão geral: 3 balões (tempo / coisas / dinheiro+extras) e um fecho com os atalhos. */
export function formatHelpOverview(): string {
  const byId = new Map(SKILLS.map((skill) => [skill.id, skill]));
  const blocks = OVERVIEW_GROUPS.map((group) => {
    const lines = group.ids.map((id) => byId.get(id)).filter((skill): skill is Skill => Boolean(skill)).map(skillLine);
    return [`*${group.title}*`, ...lines].join('\n');
  });

  const extras = ['utilidades', 'recados', 'documentos', 'pesquisa', 'rotinas']
    .map((id) => byId.get(id))
    .filter((skill): skill is Skill => Boolean(skill))
    .map(skillLine);

  const intro = 'Sou o Tom, seu parceiro 24h por aqui 🙂\nPode falar do seu jeito, por texto ou áudio. Olha o que eu faço:';
  const first = `${intro}\n\n${blocks[0]}`;
  const second = `${blocks[1]}\n\n${blocks[2]}`;
  const third = [
    '*Mais coisas*',
    ...extras,
    '',
    'Atalhos que respondem na hora: hoje, amanhã, semana, tarefas, gastos, listas, dica.',
    'Pra saber mais de um assunto, manda "ajuda" e o nome, tipo "ajuda listas".',
  ].join('\n');

  return `${first}\n\n${second}\n\n${third}`;
}

/** Detalhe de um assunto ("ajuda listas"): o que faz, exemplos e atalho. null se não achar. */
export function formatHelpTopic(topicRaw: string): string | null {
  const skill = findSkill(normalizeCommandText(topicRaw));
  if (!skill) return null;

  const lines = [`${skill.emoji} *${skill.title}*`, `Eu ${skill.blurb}.`, '', 'Você pode falar assim:', ...skill.examples.map((example) => `"${example}"`)];
  if (skill.shortcut) lines.push('', `Atalho: ${skill.shortcut}.`);
  return lines.join('\n');
}

export function formatHelpTopicNotFound(): string {
  return 'Não achei esse assunto na minha lista.\nManda só "ajuda" que eu mostro tudo o que sei fazer.';
}

/** Dica de habilidade (semanal proativa e o comando "dica"). */
export function formatSkillTip(skill: Skill): string {
  return `Uma dica do Tom 💡\n${skill.tip}`;
}

export function formatNoMoreTips(): string {
  return 'Acho que você já conhece quase tudo que eu faço 🙂\nManda "ajuda" se quiser rever a lista ou me pede o que precisar.';
}
