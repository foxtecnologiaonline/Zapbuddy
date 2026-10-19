function pickTemplate<T>(templates: T[]): T {
  return templates[Math.floor(Math.random() * templates.length)]!;
}

// Mais de uma variação, mesmo raciocínio de messages.ts/insights — é a
// única mensagem proativa que repete todo ano pra conta, sem variação
// soaria sempre o mesmo "aviso de sistema".
const TEMPLATES = [
  (label: string) => `🎉 Hoje é ${label}! Passando pra lembrar, já que você me contou disso.`,
  (label: string) => `Lembrando: hoje é ${label} 🎉`,
  (label: string) => `Ó, hoje é ${label} — não esquece 🎉`,
];

/** Template fixo, sem chamada ao LLM — mesmo raciocínio de digest/message.ts e insights/message.ts. */
export function formatImportantDateReminderMessage(label: string): string {
  return pickTemplate(TEMPLATES)(label);
}
