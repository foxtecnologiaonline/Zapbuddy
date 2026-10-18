/**
 * Mensagens estáticas enviadas ao usuário FORA do fluxo gerado pela IA —
 * erro técnico, limite de sistema, template de lembrete. A conversa normal
 * nunca vem daqui: é gerada pela Claude via system-prompt.ts. Isto cobre só
 * os poucos casos em que o próprio sistema fala por conta própria, num lugar
 * único pra manter tom/emoji consistentes e permitir revisar copy sem tocar
 * em lógica de negócio.
 */
function pickTemplate<T>(templates: T[]): T {
  return templates[Math.floor(Math.random() * templates.length)]!;
}

// Mais de uma variação de propósito (mesmo raciocínio do
// insights/message.ts) — o lembrete é a única confirmação que sai direto do
// worker, sem passar pela IA (ver reminder-dispatch.ts), então sem isso ele
// seria a única mensagem do Tom que soa sempre idêntica, palavra por
// palavra, toda vez.
const REMINDER_TEMPLATES = [(text: string) => `⏰ Lembrete: ${text}`, (text: string) => `⏰ Ó, não esquece: ${text}`, (text: string) => `⏰ Passando pra lembrar: ${text}`];

export const MESSAGES = {
  genericProcessingError:
    'Desculpa, tive um problema técnico pra processar sua última mensagem. Pode mandar de novo?',
  noReplyGenerated: 'Desculpe, não consegui processar sua mensagem agora.',
  stillProcessing: 'Só um instante, ainda to vendo isso pra você...',
  audioTooLong: 'Esse áudio é muito longo pra eu processar. Pode mandar um mais curto ou escrever em texto?',
  reminder: (text: string) => pickTemplate(REMINDER_TEMPLATES)(text),
  inviteCodeInvalid:
    'Esse código não é válido ou expirou. Confirma com quem te convidou e manda de novo (ex.: "entrar 482913"), ' +
    'ou me conta seu nome que eu sigo com seu cadastro normal.',
  documentReceived: (fileName: string) => `📎 Salvei "${fileName}". Pode pedir pra eu procurar depois.`,
} as const;
