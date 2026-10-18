import type { OnboardingNudgeStage } from '../queues/definitions.js';

// Mais de uma variação por estágio — mesmo raciocínio do
// insights/message.ts (template fixo, sem chamada ao LLM, mas isso não
// precisa significar sempre a mesma frase).
const NUDGE_2H_TEMPLATES = [
  'Oi! Vi que a gente começou a se conhecer mas não terminou — me diz seu nome que eu já te mostro como funciono 🙂',
  'Ei, ainda não peguei seu nome pra fechar seu cadastro. Me conta rapidinho que eu já começo a te ajudar.',
];

const NUDGE_24H_TEMPLATES = [
  'Ainda dá tempo de organizar seus gastos e tarefas comigo — é só me mandar seu nome que eu começo. Qualquer coisa, só escrever.',
  'Fico por aqui se quiser continuar de onde paramos — só preciso do seu nome pra liberar seu cadastro.',
];

function pickTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)]!;
}

/** Mensagem de reengajamento pra quem começou o onboarding e não respondeu (ADR 0005, sugestão 4). */
export function formatOnboardingNudgeMessage(stage: OnboardingNudgeStage): string {
  return pickTemplate(stage === '2h' ? NUDGE_2H_TEMPLATES : NUDGE_24H_TEMPLATES);
}
