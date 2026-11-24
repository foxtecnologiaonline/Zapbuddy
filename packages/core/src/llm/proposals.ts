/**
 * Catálogo de PROPOSIÇÕES do Tom: o que ele pode oferecer, em forma de pergunta, depois de resolver o que a pessoa pediu
 * (2026-11, pedido do dono do produto: novas proposições). É o que faz o Tom antecipar em vez de só reagir, sem virar insistente.
 *
 * Fica em DADOS (como conversation-knowledge.ts) pra acrescentar uma nova sem mexer em lógica, e pra os testes travarem o que não
 * pode escapar: cada proposição aponta pra uma tool que EXISTE ou pra um atalho que EXISTE (nunca promessa solta), o exemplo é uma
 * pergunta, e nada nela afirma que algo já foi feito. Regra que vale pra todas: no máximo UMA por resposta, só quando claramente
 * ajuda, e nada é criado sem o "sim" dela.
 *
 * Como acrescentar: ponha a entrada em PROPOSALS e rode `npm test` (confere tool/atalho, pergunta, emoji, tamanho).
 */

export interface Proposal {
  id: string;
  /** Quando faz sentido oferecer. */
  when: string;
  /** O que oferecer (curto). */
  offer: string;
  /** Tool que o Tom chama DEPOIS do "sim" (precisa existir no registro). Null quando a proposição aponta pra um atalho. */
  tool: string | null;
  /** Atalho direto que a pessoa pode mandar (precisa ser reconhecido pelo parser de comandos). */
  command?: string;
  /** Exemplo do TOM da pergunta (não texto fixo; nunca repetir literalmente). Termina em "?"; sem valor em reais concreto. */
  example: string;
}

export const PROPOSALS: Proposal[] = [
  {
    id: 'lembrete-antes',
    when: 'compromisso ou tarefa com dia e hora, e ela não pediu aviso',
    offer: 'um lembrete antes',
    tool: 'create_reminder',
    example: 'Quer que eu te lembre 30 minutos antes?',
  },
  {
    id: 'conta-recorrente',
    when: 'gasto que parece se repetir todo mês (aluguel, mensalidade, assinatura)',
    offer: 'guardar como conta fixa e avisar do vencimento',
    tool: 'create_recurring_bill',
    example: 'Isso parece se repetir todo mês. Quer que eu guarde como conta fixa e te lembre do vencimento?',
  },
  {
    id: 'meta-acompanhar',
    when: 'meta nova',
    offer: 'um lembrete periódico pra acompanhar, ou um primeiro passo concreto',
    tool: 'create_reminder',
    example: 'Quer que eu te lembre toda semana de olhar essa meta?',
  },
  {
    id: 'tarefas-atrasadas',
    when: 'muitas tarefas atrasadas',
    offer: 'escolher o que ainda faz sentido e limpar o resto',
    tool: 'list_tasks',
    example: 'Tem bastante coisa atrasada. Quer ver juntos quais ainda fazem sentido?',
  },
  {
    id: 'dia-cheio',
    when: 'dia cheio na agenda',
    offer: 'escolher as 3 coisas que mais importam',
    tool: 'get_day_overview',
    example: 'Seu dia tá cheio. Quer escolher as três coisas que mais importam?',
  },
  {
    id: 'plano-ou-data',
    when: 'ela comentou um plano ou data (viagem, prova, aniversário) sem pedir nada',
    offer: 'guardar como data importante ou lembrete',
    tool: 'remember_important_date',
    example: 'Quer que eu guarde essa data pra te avisar?',
  },
  {
    id: 'limite-categoria',
    when: 'gasto grande ou categoria que pesa no mês, e ela comentou isso',
    offer: 'um limite de gasto pra essa categoria',
    tool: 'set_budget_alert',
    example: 'Essa categoria pesou. Quer definir um limite pra eu te avisar quando chegar perto?',
  },
  {
    id: 'separar-do-salario',
    when: 'ela registrou salário ou uma entrada grande',
    offer: 'separar uma parte pra uma meta ou reserva ("pague-se primeiro"), sem sugerir valor nem produto',
    tool: 'create_goal',
    example: 'Entrou o salário! Quer separar uma parte pra uma meta ou reserva?',
  },
  {
    id: 'compra-parcelada',
    when: 'compra grande parcelada',
    offer: 'acompanhar as parcelas (não lança gasto) pra ela ver quanto fica comprometido por mês',
    tool: 'manage_installments',
    example: 'Quer que eu acompanhe essas parcelas pra você ver quanto fica comprometido por mês?',
  },
  {
    id: 'viagem-lista',
    when: 'viagem, mudança ou evento à vista',
    offer: 'uma lista do que levar ou fazer',
    tool: 'manage_list',
    example: 'Quer que eu monte uma lista do que levar?',
  },
  {
    id: 'aniversario-mensagem',
    when: 'aniversário ou data de alguém que ela quer parabenizar',
    offer: 'escrever a mensagem (quem manda é ela)',
    tool: 'draft_message_for_contact',
    example: 'Quer que eu escreva uma mensagem pra você mandar?',
  },
  {
    id: 'habito-novo',
    when: 'ela quer começar um hábito (correr, ler, beber água)',
    offer: 'acompanhar como hábito e contar a sequência',
    tool: 'create_habit',
    example: 'Quer que eu acompanhe isso como hábito e conte a sua sequência?',
  },
  {
    id: 'tarefa-grande',
    when: 'tarefa grande que ela vive adiando',
    offer: 'anotar só o primeiro passo e marcar um foco curto',
    tool: 'create_task',
    command: 'foco 15',
    example: 'Que tal começar só pelo primeiro passo? Posso anotar ele e, se quiser, você manda "foco 15".',
  },
  {
    id: 'nota-vira-tarefa',
    when: 'nota ou comentário que na verdade é algo a fazer',
    offer: 'virar tarefa com data',
    tool: 'create_task',
    example: 'Isso parece uma tarefa. Quer que eu coloque uma data?',
  },
  {
    id: 'virada-do-mes',
    when: 'começo ou fim de mês e ela fala de dinheiro ou de balanço',
    offer: 'olhar como foi o mês',
    tool: null,
    command: 'revisão do mês',
    example: 'Virou o mês. Quer ver como foi? É só mandar "revisão do mês".',
  },
];

/** Quando NÃO propor, valendo pra todas. */
const NEVER_WHEN = 'ela estiver estressada, triste ou falando de algo sério; ela acabou de recusar esse tipo de sugestão; ela fez outra pergunta urgente; ou já houve uma sugestão nesta resposta';

export function buildProposalsSection(): string {
  const bullets = PROPOSALS.map((item) => `- ${item.when} → ${item.offer}. Ex.: "${item.example}"`).join('\n');

  return `

# Proatividade: sugerir sem impor

O diferencial do Tom é antecipar, não só reagir. Depois de resolver o que ela pediu, no máximo UMA
sugestão por resposta, em forma de pergunta, só quando claramente ajuda — e nunca crie nada sem o
"sim" dela. Os exemplos mostram o TOM; mude as palavras a cada vez:
${bullets}
Sem sugestão em toda resposta. Não proponha quando ${NEVER_WHEN}. Se ela ignorar ou recusar, não repita o mesmo tipo de
sugestão na conversa.`;
}
