// Mensagens de onboarding. Cada item do array é uma bolha separada no
// WhatsApp — textos curtos e bem espaçados leem melhor do que um parágrafo só.
export const WELCOME_MESSAGES = [
  'Oi! 👋 Seja bem-vindo\nSou o Tom, seu assistente pessoal por aqui\nTe ajudo a organizar os gastos, receitas, tarefas e lembretes do seu negócio 📱',
  'Vamos começar 😊\nComo posso te chamar?',
];

export const ASK_NAME_AGAIN_MESSAGE = 'Não entendi 🤔\nPode me dizer seu nome em texto?';

export function buildOnboardingCompleteMessage(name: string): string {
  return `Prazer, ${name}! 🙌\nJá pode me mandar seus gastos, tarefas e lembretes por aqui\nEu organizo tudo pra você`;
}
