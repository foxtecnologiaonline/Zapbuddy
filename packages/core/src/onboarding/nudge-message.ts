import type { OnboardingNudgeStage } from '../queues/definitions.js';

// Mais de uma variação por estágio — mesmo raciocínio do
// insights/message.ts (template fixo, sem chamada ao LLM, mas isso não
// precisa significar sempre a mesma frase).
const NUDGE_2H_TEMPLATES = [
  'Oi! Aqui é o Tom 🙂 A gente começou e não terminou — me diz como posso te chamar e já te mostro como funciono.',
  'Ei, ainda não peguei seu nome. Me conta rapidinho que eu já começo a organizar sua agenda, suas tarefas e seus gastos.',
  'Oi, sou eu de novo, o Tom 🙂 Falta só seu nome pra deixar tudo pronto por aqui.',
];

const NUDGE_24H_TEMPLATES = [
  'Deixo a porta aberta por aqui 🙂 Me manda seu nome e a primeira coisa que você quer organizar — tarefa, gasto, lembrete, o que vier.',
  'Fico por aqui se quiser continuar de onde paramos. Me diz seu nome e manda a primeira coisa (tipo "gastei 30 no almoço") que eu cuido do resto.',
  'Sem pressa, tá? Quando quiser, me manda seu nome e a gente começa — agenda, tarefas, notas ou gastos, o que for mais útil pra você.',
];

function pickTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)]!;
}

/** Mensagem de reengajamento pra quem começou o onboarding e não respondeu (ADR 0005, sugestão 4). */
export function formatOnboardingNudgeMessage(stage: OnboardingNudgeStage): string {
  return pickTemplate(stage === '2h' ? NUDGE_2H_TEMPLATES : NUDGE_24H_TEMPLATES);
}
