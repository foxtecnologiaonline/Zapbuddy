/**
 * Roteador de comandos diretos (sugestão #13): atalhos que dispensam o LLM —
 * zero tool schema no contexto, resposta instantânea e sem custo de token.
 *
 * Regra de ouro: só casa MENSAGEM INTEIRA (texto curto e exato, depois de
 * normalizar). Qualquer frase maior, ambígua ou com contexto vai pro LLM —
 * "hoje" é comando, "hoje gastei 30 no almoço" não é. Na dúvida, não casa.
 */

export type RoutineName = 'day_close' | 'week_review' | 'checkins';

export type Command =
  | { kind: 'help'; topic: string | null }
  | { kind: 'overview'; period: 'today' | 'tomorrow' | 'week' }
  | { kind: 'tasks' }
  | { kind: 'spending'; period: 'today' | 'week' | 'month' }
  | { kind: 'lists' }
  | { kind: 'list_show'; name: string }
  | { kind: 'undo' }
  | { kind: 'digest'; enabled: boolean }
  | { kind: 'tip' }
  | { kind: 'tips'; enabled: boolean }
  | { kind: 'routine'; routine: RoutineName; enabled: boolean }
  | { kind: 'run_routine'; routine: 'day_close' | 'week_review' }
  | { kind: 'focus'; minutes: number };

/** minúsculas, sem acento, sem pontuação, espaços colapsados; tira "tom," do começo e "/" de comando. */
export function normalizeCommandText(raw: string): string {
  const text = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.replace(/^(tom|oi tom|ola tom|e ai tom)\s+/, '').trim();
}

const MAX_COMMAND_CHARS = 60;
const DEFAULT_FOCUS_MINUTES = 25;
const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 120;

const HELP_ALIASES = new Set([
  'ajuda',
  'help',
  'menu',
  'comandos',
  'quais comandos',
  'quais sao os comandos',
  'o que posso pedir',
]);
const TODAY_ALIASES = new Set(['hoje', 'meu dia', 'agenda de hoje', 'o que tenho hoje', 'como esta meu dia', 'como ta meu dia', 'resumo do dia']);
const TOMORROW_ALIASES = new Set(['amanha', 'agenda de amanha', 'o que tenho amanha', 'meu amanha']);
const WEEK_ALIASES = new Set(['semana', 'minha semana', 'agenda da semana', 'o que tenho essa semana', 'o que tenho na semana', 'proximos dias']);
const TASKS_ALIASES = new Set(['tarefas', 'minhas tarefas', 'lista de tarefas', 'pendencias', 'minhas pendencias', 'o que falta fazer', 'o que falta']);
const SPENDING_TODAY = new Set(['gastos de hoje', 'gastos hoje', 'quanto gastei hoje']);
const SPENDING_WEEK = new Set(['gastos da semana', 'gastos da ultima semana', 'quanto gastei na semana', 'quanto gastei essa semana']);
const SPENDING_MONTH = new Set(['gastos', 'meus gastos', 'gastos do mes', 'quanto gastei', 'quanto gastei no mes', 'quanto gastei esse mes', 'resumo financeiro']);
const LISTS_ALIASES = new Set(['listas', 'minhas listas', 'ver listas', 'quais listas']);
const UNDO_ALIASES = new Set(['desfazer', 'desfaz', 'desfazer isso', 'desfaz isso', 'desfazer ultima', 'desfazer ultima acao']);
const TIP_ALIASES = new Set(['dica', 'uma dica', 'dica do tom', 'me da uma dica', 'me de uma dica', 'dica do dia']);

const DIGEST_OFF = new Set(['pausar bom dia', 'desligar bom dia', 'desligar resumo', 'desativar resumo', 'parar resumo', 'parar resumo da manha', 'desligar resumo da manha', 'parar bom dia']);
const DIGEST_ON = new Set(['ligar bom dia', 'ativar bom dia', 'ligar resumo', 'ativar resumo', 'voltar resumo', 'ligar resumo da manha', 'ativar resumo da manha']);
const TIPS_OFF = new Set(['desligar dicas', 'parar dicas', 'desativar dicas', 'sem dicas']);
const TIPS_ON = new Set(['ligar dicas', 'ativar dicas']);

const ROUTINE_ON: Record<string, RoutineName> = {
  'ligar fechamento do dia': 'day_close',
  'ativar fechamento do dia': 'day_close',
  'ligar revisao da semana': 'week_review',
  'ativar revisao da semana': 'week_review',
  'ligar checkins': 'checkins',
  'ativar checkins': 'checkins',
  'ligar check ins': 'checkins',
  'ativar check ins': 'checkins',
};
const ROUTINE_OFF: Record<string, RoutineName> = {
  'desligar fechamento do dia': 'day_close',
  'desativar fechamento do dia': 'day_close',
  'parar fechamento do dia': 'day_close',
  'desligar revisao da semana': 'week_review',
  'desativar revisao da semana': 'week_review',
  'parar revisao da semana': 'week_review',
  'desligar checkins': 'checkins',
  'desativar checkins': 'checkins',
  'parar checkins': 'checkins',
  'desligar check ins': 'checkins',
  'parar check ins': 'checkins',
  'parar de perguntar como foi': 'checkins',
  'nao perguntar como foi': 'checkins',
};
const RUN_ROUTINE: Record<string, 'day_close' | 'week_review'> = {
  'fechamento do dia': 'day_close',
  'fechar o dia': 'day_close',
  'fechar meu dia': 'day_close',
  'revisao da semana': 'week_review',
  'revisar a semana': 'week_review',
  'revisar minha semana': 'week_review',
};

// "lista de compras" / "minha lista do mercado" — conector obrigatório e nome curto, pra "lista os gastos de ontem" não virar comando.
const LIST_SHOW_PATTERN = /^(?:minha |a |ver |mostrar |mostra )?lista (?:de |do |da |dos |das )([a-z0-9 ]{2,30})$/;
const LIST_NAME_STOPWORDS = new Set(['tarefas', 'gastos', 'ontem', 'hoje', 'amanha']);

const FOCUS_PATTERN = /^(?:foco|focar|pomodoro|modo foco)(?: de)?(?: (\d{1,3}))?(?: min| minutos)?$/;

export function parseCommand(rawText: string): Command | null {
  if (rawText.length > MAX_COMMAND_CHARS) return null;
  const text = normalizeCommandText(rawText);
  if (text.length === 0) return null;

  if (HELP_ALIASES.has(text)) return { kind: 'help', topic: null };
  const helpTopic = /^(?:ajuda|help)(?: sobre| de| com)? ([a-z0-9 ]{2,30})$/.exec(text);
  if (helpTopic) return { kind: 'help', topic: helpTopic[1]!.trim() };

  if (TODAY_ALIASES.has(text)) return { kind: 'overview', period: 'today' };
  if (TOMORROW_ALIASES.has(text)) return { kind: 'overview', period: 'tomorrow' };
  if (WEEK_ALIASES.has(text)) return { kind: 'overview', period: 'week' };
  if (TASKS_ALIASES.has(text)) return { kind: 'tasks' };
  if (SPENDING_TODAY.has(text)) return { kind: 'spending', period: 'today' };
  if (SPENDING_WEEK.has(text)) return { kind: 'spending', period: 'week' };
  if (SPENDING_MONTH.has(text)) return { kind: 'spending', period: 'month' };
  if (LISTS_ALIASES.has(text)) return { kind: 'lists' };
  if (UNDO_ALIASES.has(text)) return { kind: 'undo' };
  if (TIP_ALIASES.has(text)) return { kind: 'tip' };

  if (DIGEST_OFF.has(text)) return { kind: 'digest', enabled: false };
  if (DIGEST_ON.has(text)) return { kind: 'digest', enabled: true };
  if (TIPS_OFF.has(text)) return { kind: 'tips', enabled: false };
  if (TIPS_ON.has(text)) return { kind: 'tips', enabled: true };

  const routineOn = ROUTINE_ON[text];
  if (routineOn) return { kind: 'routine', routine: routineOn, enabled: true };
  const routineOff = ROUTINE_OFF[text];
  if (routineOff) return { kind: 'routine', routine: routineOff, enabled: false };
  const run = RUN_ROUTINE[text];
  if (run) return { kind: 'run_routine', routine: run };

  const focus = FOCUS_PATTERN.exec(text);
  if (focus) {
    const minutes = focus[1] ? Number(focus[1]) : DEFAULT_FOCUS_MINUTES;
    if (minutes >= MIN_FOCUS_MINUTES && minutes <= MAX_FOCUS_MINUTES) return { kind: 'focus', minutes };
    return null;
  }

  const listShow = LIST_SHOW_PATTERN.exec(text);
  if (listShow) {
    const name = listShow[1]!.trim();
    if (LIST_NAME_STOPWORDS.has(name)) return null;
    if (name.split(' ').length > 3) return null;
    return { kind: 'list_show', name };
  }

  return null;
}
