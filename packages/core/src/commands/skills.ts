/**
 * Catálogo das habilidades do Tom (sugestões #14 e #15): fonte única do "ajuda"
 * (visão geral e por assunto) e da dica semanal de habilidade ainda não usada.
 * Texto fixo, sem LLM, e sem nada que dependa de painel ou cobrança — o que
 * está aqui existe e funciona com os interruptores desligados.
 *
 * `tools` liga a habilidade ao uso real (tool_call_logs) pra dica escolher só
 * o que a pessoa ainda não experimentou; um teste garante que todo nome aqui
 * existe de verdade no registro de tools.
 */
export interface Skill {
  id: string;
  /** Palavras que levam a este assunto em "ajuda <assunto>" (já normalizadas, sem acento). */
  aliases: string[];
  emoji: string;
  title: string;
  /** Uma frase do que faz (vira a linha da visão geral). */
  blurb: string;
  examples: string[];
  tools: string[];
  /** Atalho direto (sem IA), quando existe. */
  shortcut?: string;
  /** Texto da dica semanal: curto, concreto, sem prometer o que não existe. */
  tip: string;
}

export const SKILLS: Skill[] = [
  {
    id: 'agenda',
    aliases: ['agenda', 'compromisso', 'compromissos', 'reuniao', 'calendario'],
    emoji: '📅',
    title: 'Agenda e compromissos',
    blurb: 'marco e consulto seus compromissos',
    examples: ['reunião sexta às 15h', 'o que tenho amanhã?', 'muda a consulta pra quinta'],
    tools: ['create_calendar_event', 'list_calendar_events', 'update_calendar_event'],
    shortcut: 'hoje, amanhã ou semana',
    tip: 'Quer ver o que tem no seu dia? Manda só "hoje" (ou "amanhã", ou "semana") e eu te mostro tudo de uma vez: compromissos, tarefas e lembretes.',
  },
  {
    id: 'lembretes',
    aliases: ['lembrete', 'lembretes', 'avisar', 'alarme'],
    emoji: '⏰',
    title: 'Lembretes',
    blurb: 'aviso você na hora certa, até todo dia ou toda semana',
    examples: ['me lembra de ligar pro João amanhã às 9h', 'toda segunda às 8h me lembra de tomar o remédio'],
    tools: ['create_reminder', 'list_reminders', 'update_reminder'],
    tip: 'Dá pra criar lembrete que se repete: "toda segunda às 8h me lembra de ..." e eu aviso sozinho toda semana.',
  },
  {
    id: 'tarefas',
    aliases: ['tarefa', 'tarefas', 'afazeres', 'pendencias'],
    emoji: '📌',
    title: 'Tarefas',
    blurb: 'guardo o que você precisa fazer, com ou sem data',
    examples: ['preciso renovar a CNH até dia 20', 'conclui a tarefa do relatório'],
    tools: ['create_task', 'list_tasks', 'complete_task', 'update_task'],
    shortcut: 'tarefas',
    tip: 'Pra ver tudo que está pendente, manda só "tarefas". Se algo já rolou, é só me dizer que eu marco como feito.',
  },
  {
    id: 'notas',
    aliases: ['nota', 'notas', 'anotacao', 'anotacoes', 'anotar'],
    emoji: '📝',
    title: 'Notas',
    blurb: 'anoto o que você quiser guardar e acho depois',
    examples: ['anota: ideia de presente pra minha mãe', 'o que anotei sobre a viagem?'],
    tools: ['create_note', 'list_notes', 'update_note'],
    tip: 'Pode me mandar qualquer coisa pra guardar com "anota:". Depois é só perguntar "o que anotei sobre ...?" que eu procuro.',
  },
  {
    id: 'listas',
    aliases: ['lista', 'listas', 'compras', 'mercado', 'supermercado'],
    emoji: '🛒',
    title: 'Listas',
    blurb: 'mantenho listas de compras, viagem ou o que precisar',
    examples: ['põe leite, pão e café na lista de compras', 'riscou o pão', 'mostra a lista de compras'],
    tools: ['manage_list'],
    shortcut: 'listas',
    tip: 'Eu guardo listas, tipo a de compras. Manda "põe leite e pão na lista de compras", vai marcando o que já pegou, e pra ver é só dizer "lista de compras".',
  },
  {
    id: 'gastos',
    aliases: ['gasto', 'gastos', 'dinheiro', 'financeiro', 'financas', 'despesa', 'receita'],
    emoji: '💸',
    title: 'Gastos e receitas',
    blurb: 'registro o que entra e sai e mostro os resumos',
    examples: ['gastei 50 no mercado', 'recebi 1200 de salário', 'quanto gastei esse mês?'],
    tools: ['record_transaction', 'get_financial_summary', 'set_budget_alert'],
    shortcut: 'gastos',
    tip: 'Dá pra criar um limite por categoria, tipo "me avisa se passar de 600 em restaurantes no mês". Eu aviso quando chegar perto.',
  },
  {
    id: 'parcelas',
    aliases: ['parcela', 'parcelas', 'parcelado', 'compromissos financeiros', 'prestacao', 'contas'],
    emoji: '🏠',
    title: 'Contas e parcelas',
    blurb: 'acompanho contas fixas e compras parceladas',
    examples: ['comprei um celular em 10x de 300', 'quanto já tenho comprometido nos próximos meses?'],
    tools: ['manage_installments', 'create_recurring_bill', 'list_recurring_bills'],
    tip: 'Tem compra parcelada? Me conta ("notebook em 12x de 250, começa mês que vem") e eu mostro quanto fica comprometido por mês.',
  },
  {
    id: 'calculos',
    aliases: ['calculo', 'calculos', 'calculadora', 'conta', 'rachar', 'dividir', 'porcentagem'],
    emoji: '🧮',
    title: 'Cálculos',
    blurb: 'faço a conta certinha, sem chute',
    examples: ['racha 240 entre 4 com 10%', '15% de 380', '1200 + 8%'],
    tools: ['calculate'],
    tip: 'Pra qualquer conta, me manda direto: "racha 240 entre 4 com 10%", "15% de 380" ou "quanto é 3 x 129,90". Eu calculo exato, sem chute.',
  },
  {
    id: 'metas',
    aliases: ['meta', 'metas', 'objetivo', 'objetivos', 'economizar', 'juntar'],
    emoji: '🎯',
    title: 'Metas',
    blurb: 'acompanho metas de guardar dinheiro e metas pessoais',
    examples: ['quero juntar 5 mil até dezembro', 'guardei mais 300', 'quero ler mais'],
    tools: ['create_goal', 'add_goal_progress', 'create_personal_goal'],
    tip: 'Se tem uma meta (juntar uma grana, ler mais, fazer exercício), me conta. Eu guardo e vou te ajudando a acompanhar.',
  },
  {
    id: 'habitos',
    aliases: ['habito', 'habitos', 'rotina', 'sequencia'],
    emoji: '💪',
    title: 'Hábitos',
    blurb: 'conto sua sequência de dias seguidos',
    examples: ['quero criar o hábito de caminhar', 'fui caminhar hoje'],
    tools: ['create_habit', 'log_habit_checkin', 'list_habits'],
    tip: 'Quer manter uma rotina? Diz "quero criar o hábito de caminhar" e, nos dias que fizer, é só avisar. Eu conto a sequência.',
  },
  {
    id: 'planejar',
    aliases: ['planejar', 'planejamento', 'organizar', 'monta', 'montar', 'dia'],
    emoji: '🗓️',
    title: 'Montar o dia',
    blurb: 'organizo seu dia nos horários livres',
    examples: ['monta meu dia', 'organiza minha tarde'],
    tools: ['get_day_overview'],
    shortcut: 'hoje',
    tip: 'Dia cheio? Manda "monta meu dia". Eu olho agenda, tarefas e lembretes, acho seus horários livres e sugiro uma ordem.',
  },
  {
    id: 'foco',
    aliases: ['foco', 'pomodoro', 'concentracao', 'concentrar'],
    emoji: '⏱️',
    title: 'Foco',
    blurb: 'marco um tempo de foco e aviso quando acabar',
    examples: ['foco 25', 'pomodoro 45'],
    tools: ['time_utils'],
    shortcut: 'foco 25',
    tip: 'Pra trabalhar sem distração, manda "foco 25". Eu aviso quando os 25 minutos acabarem.',
  },
  {
    id: 'utilidades',
    aliases: ['hora', 'horas', 'data', 'datas', 'feriado', 'feriados', 'clima', 'tempo', 'dolar', 'cotacao'],
    emoji: '🌍',
    title: 'Hora, datas, clima e cotações',
    blurb: 'respondo hora em outras cidades, dias até uma data, feriados, clima e câmbio',
    examples: ['que horas são em Lisboa?', 'quantos dias faltam pro Natal?', 'qual o próximo feriado?', 'vai chover amanhã?'],
    tools: ['time_utils', 'get_weather', 'get_market_rate'],
    tip: 'Dá pra me perguntar coisas do dia a dia: "que horas são em Lisboa?", "quantos dias faltam pro Natal?", "qual o próximo feriado?".',
  },
  {
    id: 'recados',
    aliases: ['recado', 'recados', 'mensagem', 'mensagens', 'contato', 'contatos'],
    emoji: '💬',
    title: 'Recados',
    blurb: 'escrevo a mensagem pra você enviar a alguém',
    examples: ['escreve um parabéns pra Aline', 'manda um bom dia pro João'],
    tools: ['draft_message_for_contact'],
    tip: 'Sem saber como escrever pra alguém? Peça "escreve um parabéns pra Aline". Eu redijo e você só toca no link pra enviar.',
  },
  {
    id: 'documentos',
    aliases: ['documento', 'documentos', 'foto', 'comprovante', 'pdf', 'arquivo'],
    emoji: '📎',
    title: 'Fotos e documentos',
    blurb: 'leio comprovantes e contas que você mandar e guardo pra achar depois',
    examples: ['(manda a foto de um comprovante)', 'cadê o boleto da luz?'],
    tools: ['find_document'],
    tip: 'Pode me mandar a foto de um comprovante, uma conta ou um PDF. Eu leio, guardo e depois acho pra você quando pedir.',
  },
  {
    id: 'datas',
    aliases: ['aniversario', 'aniversarios', 'datas importantes'],
    emoji: '🎂',
    title: 'Datas importantes',
    blurb: 'lembro aniversários e datas que se repetem todo ano',
    examples: ['guarda o aniversário da minha mãe, 12 de março'],
    tools: ['remember_important_date', 'list_important_dates'],
    tip: 'Me conta os aniversários e datas que não podem passar batido ("aniversário da minha mãe, 12 de março"). Eu te aviso no dia, todo ano.',
  },
  {
    id: 'rotinas',
    aliases: ['rotinas', 'fechamento', 'revisao', 'checkin', 'checkins', 'resumo'],
    emoji: '🌙',
    title: 'Fechamento do dia e revisão da semana',
    blurb: 'posso fechar seu dia à noite e revisar a semana no domingo, se você quiser',
    examples: ['ligar fechamento do dia', 'ligar revisão da semana', 'desligar check-ins'],
    tools: ['set_morning_digest_preferences'],
    shortcut: 'fechamento do dia',
    tip: 'Quer um fechamento do dia, com o que você fez e o que ficou pra amanhã? Manda "ligar fechamento do dia". Também tem a revisão da semana, no domingo.',
  },
  {
    id: 'pesquisa',
    aliases: ['pesquisa', 'pesquisar', 'buscar', 'internet', 'noticia', 'noticias'],
    emoji: '🔎',
    title: 'Pesquisa',
    blurb: 'busco na internet quando você tem uma dúvida',
    examples: ['o que é Tesouro Selic?', 'quando é o próximo jogo do meu time?'],
    tools: ['web_search'],
    tip: 'Ficou com dúvida de algo (um termo, uma regra, uma notícia)? Pergunta pra mim que eu pesquiso na hora.',
  },
];

/** Todos os nomes de tool citados no catálogo (usado pelo teste que garante que existem). */
export function skillToolNames(): string[] {
  return [...new Set(SKILLS.flatMap((skill) => skill.tools))];
}

export function findSkill(topicNormalized: string): Skill | null {
  const topic = topicNormalized.trim();
  if (!topic) return null;
  return (
    SKILLS.find((skill) => skill.id === topic || skill.aliases.includes(topic)) ??
    SKILLS.find((skill) => skill.aliases.some((alias) => topic.startsWith(alias) || alias.startsWith(topic))) ??
    null
  );
}

/**
 * Próxima dica de habilidade: a primeira do catálogo que a pessoa ainda não
 * usou (nenhuma das tools dela aparece nas já usadas) e que ainda não foi
 * mandada. null quando acabaram — aí a dica simplesmente não sai.
 */
export function pickTip(usedToolNames: ReadonlySet<string>, alreadySentIds: ReadonlySet<string>): Skill | null {
  return (
    SKILLS.find((skill) => !alreadySentIds.has(skill.id) && !skill.tools.some((tool) => usedToolNames.has(tool))) ?? null
  );
}
