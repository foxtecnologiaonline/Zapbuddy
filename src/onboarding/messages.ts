// Mensagens de onboarding. Cada item do array é uma bolha separada no
// WhatsApp — textos curtos e bem espaçados leem melhor do que um parágrafo só.
export const WELCOME_MESSAGES = [
  'Oi! 👋 Seja bem-vindo, sou o Tom, seu assistente pessoal.\nEu te ajudo a organizar gastos, receitas, tarefas e lembretes do seu negócio, tudo pelo WhatsApp 📱',
  'Vamos começar! 😊\nComo posso te chamar?',
];

export function buildOnboardingCompleteMessage(name: string): string {
  return `Prazer, ${name}! 🙌\nJá pode me mandar seus gastos, tarefas e lembretes por aqui que eu organizo tudo pra você.`;
}
