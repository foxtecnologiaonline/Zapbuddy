/**
 * "Sugestão" (comando direto, sem LLM): o próximo passo útil a partir do que a pessoa JÁ registrou. Cada sugestão só aparece
 * com dado que a sustente — fonte que não deu pra ler vira `null` e a sugestão correspondente NÃO sai (nunca "você não tem meta"
 * sem ter conferido). Nada é criado: a linha "é só dizer" é a frase que a pessoa usa pra o Tom agir.
 */

export interface SuggestionSignals {
  overdueCount: number | null;
  undatedPendingCount: number | null;
  habitsMissingToday: string[] | null;
  hasGoals: boolean | null;
  hasBills: boolean | null;
  hasReminders: boolean | null;
  /** Data importante mais próxima, só se for em até 3 dias. */
  upcomingDate: { label: string; days: number } | null;
  /** Variação % do gasto do mês contra o mesmo trecho do mês passado (só com as duas bases > 0). */
  spendChangePercent: number | null;
}

export interface Suggestion {
  id: string;
  text: string;
  say: string;
}

const SPEND_UP_THRESHOLD_PERCENT = 20;
const MANY_OVERDUE = 3;
const MANY_UNDATED = 5;
const MAX_SUGGESTIONS = 3;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function inDays(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `daqui a ${days} dias`;
}

/** Em ordem de prioridade: o que está pesando agora vem antes do que é só oportunidade. */
export function pickSuggestions(signals: SuggestionSignals, max: number = MAX_SUGGESTIONS): Suggestion[] {
  const all: Suggestion[] = [];

  if (signals.overdueCount !== null && signals.overdueCount > 0) {
    const n = signals.overdueCount;
    all.push(
      n >= MANY_OVERDUE
        ? { id: 'overdue-many', text: `Você tem ${n} tarefas atrasadas. Vale decidir o que ainda faz sentido e limpar o resto.`, say: 'Manda "tarefas" pra ver a lista e me diz o que concluir ou apagar.' }
        : { id: 'overdue-few', text: `Tem ${n} ${plural(n, 'tarefa atrasada', 'tarefas atrasadas')}.`, say: 'Manda "tarefas" e me diz se rolou ou se é pra remarcar.' },
    );
  }
  if (signals.upcomingDate) {
    all.push({
      id: 'upcoming-date',
      text: `${signals.upcomingDate.label} é ${inDays(signals.upcomingDate.days)}.`,
      say: 'Se quiser, eu escrevo uma mensagem pra você mandar: diga "escreve uma mensagem pra ...".',
    });
  }
  if (signals.habitsMissingToday && signals.habitsMissingToday.length > 0) {
    all.push({ id: 'habits-missing', text: `Falta marcar hoje: ${signals.habitsMissingToday.slice(0, 3).join(', ')}.`, say: 'Fez? Diga "fiz ..." que eu marco.' });
  }
  if (signals.spendChangePercent !== null && signals.spendChangePercent >= SPEND_UP_THRESHOLD_PERCENT) {
    all.push({
      id: 'spend-up',
      text: `Seus gastos do mês estão ${Math.round(signals.spendChangePercent)}% acima do mesmo trecho do mês passado.`,
      say: 'Manda "gastos do mês" pra ver onde pesou.',
    });
  }
  if (signals.undatedPendingCount !== null && signals.undatedPendingCount >= MANY_UNDATED) {
    all.push({ id: 'undated', text: `Tem ${signals.undatedPendingCount} tarefas sem data.`, say: 'Dê um prazo pras mais importantes, tipo "a do relatório é pra sexta".' });
  }
  if (signals.hasGoals === false) {
    all.push({ id: 'no-goal', text: 'Você ainda não tem nenhuma meta.', say: 'Diga, por exemplo, "quero juntar R$ 1.000 até junho" ou "quero ler mais".' });
  }
  if (signals.hasBills === false) {
    all.push({ id: 'no-bills', text: 'Nenhuma conta fixa guardada.', say: 'Se algo vence todo mês, diga "internet vence dia 10, R$ 99" que eu guardo pra te lembrar.' });
  }
  if (signals.hasReminders === false) {
    all.push({ id: 'no-reminders', text: 'Você não tem nenhum lembrete pendente.', say: 'Pra criar um: "me lembra de ... amanhã às 9h".' });
  }

  return all.slice(0, max);
}

export function formatSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) {
    return 'Está tudo em ordem por aqui 🙂\nSe quiser, manda "revisão do mês" pra ver como foi o mês, ou "dica" que eu conto algo novo que sei fazer.';
  }
  const blocks = suggestions.map((item) => `• ${item.text}\n  ${item.say}`);
  return ['💡 *Sugestões pra agora*', ...blocks].join('\n');
}
