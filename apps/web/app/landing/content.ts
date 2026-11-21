import { formatMonthlyPriceBRL } from '@zapbuddy/core';

/**
 * Copy da LP do Tom. Dado puro, sem JSX — as regras de produto (sem prova social inventada, sem
 * promessa de rendimento, só o que existe no código) são checadas em content.test.ts.
 * Ver docs/adr/0010-landing-page.md.
 */

export const PRICE_LABEL = formatMonthlyPriceBRL();

/** Duração do teste (default de `users.trial_ends_at`, migration 0023). Só aparece com cobrança ligada. */
export const TRIAL_DAYS = 3;

/**
 * Interruptores de produto (ADR 0008): com painel e cobrança desligados — o padrão — a LP não
 * pode prometer preço, teste, painel, exportação nem CPF. Lidos em runtime pela página.
 */
export interface LandingFlags {
  billing: boolean;
  dashboard: boolean;
}

export const PREFILLED_MESSAGE = 'Oi, Tom!';

export const HERO = {
  eyebrow: 'Seu parceiro pessoal no WhatsApp',
  title: 'Seu parceiro de todo dia, 24 horas, no WhatsApp.',
  subtitle:
    'O Tom te ouve, te responde e cuida da sua agenda, das suas tarefas, das suas notas e do seu dinheiro. Você fala do jeito que falaria com um amigo, em texto ou áudio. Ele anota, lembra e sugere o próximo passo.',
  ctaLabel: 'Começar pelo WhatsApp',
  chat: [
    { from: 'user', text: 'gastei 80 no mercado' },
    { from: 'tom', text: 'Fechou, 80 conto de mercado anotado 🛒' },
    { from: 'user', text: 'cria uma tarefa pra ligar pro contador sexta' },
    { from: 'tom', text: 'Anotado! ✅\nLigar pro contador, sexta.' },
  ] as const,
};

export function heroMicrocopy({ billing }: LandingFlags): string {
  return billing
    ? `${TRIAL_DAYS} dias de teste · depois ${PRICE_LABEL}/mês`
    : 'Liberado por enquanto, sem cobrança';
}

/**
 * Compromissos dependem de agenda conectada (OAuth), e conectar agenda passa pelo painel (ADR 0008):
 * com o painel desligado — o padrão — nenhum visitante novo consegue conectar, e o Tom salva o
 * compromisso como tarefa com data e hora. Por isso o aviso de conflito de horário só entra com painel.
 * Só o Google Agenda é citado: o Outlook ainda não tem credencial do Azure configurada.
 */
export function pillars({ dashboard }: LandingFlags) {
  return {
  title: 'Do jeito que você já fala',
  intro:
    'Sem aplicativo, sem formulário, sem palavra-chave. Manda "gastei 80 no mercado" ou um áudio de 20 segundos e o Tom entende.',
  groups: [
    {
      tag: 'Tempo',
      title: 'Agenda e tarefas',
      items: [
        {
          title: 'Compromissos',
          text: dashboard
            ? 'Conecte o Google Agenda e ele marca reunião ou consulta direto na sua agenda. Se dois compromissos baterem no mesmo horário, ele avisa.'
            : 'Guarda reunião, consulta e outros compromissos com data e hora, e te lembra na hora que você pedir.',
        },
        {
          title: 'Tarefas e lembretes',
          text: 'Cria, lista e conclui por mensagem. O lembrete chega na hora que você pediu.',
        },
        {
          title: 'Datas que se repetem',
          text: 'Aniversários e datas importantes do ano: ele avisa no dia certo, todo ano.',
        },
      ],
    },
    {
      tag: 'Dinheiro',
      title: 'Financeiro pessoal',
      items: [
        {
          title: 'Gastos e receitas',
          text: 'Registra por texto ou áudio e categoriza sozinho. Errou o valor? Você corrige na conversa.',
        },
        {
          title: 'Resumo da semana',
          text: 'Quanto saiu, quanto entrou, e como ficou em relação à semana anterior.',
        },
        {
          title: 'Contas e metas',
          text: 'Você informa suas contas recorrentes e suas metas com valor. Ele acompanha o que você disse, sem estimar nada.',
        },
      ],
    },
    {
      tag: 'Cabeça',
      title: 'Notas e memória',
      items: [
        {
          title: 'Notas pessoais',
          text: 'Anota ideia, lista ou o que você não quer esquecer. Depois você procura por palavra.',
        },
        {
          title: 'Metas pessoais',
          text: 'Quer ler mais ou fechar mais clientes? Ele acompanha, sem prazo rígido.',
        },
        {
          title: 'Memória',
          text: dashboard
            ? 'Lembra o que você contou sobre sua rotina e suas preferências. Você vê tudo e apaga quando quiser.'
            : 'Lembra o que você contou sobre sua rotina e suas preferências, pra não repetir tudo toda vez.',
        },
      ],
    },
  ],
  } as const;
}

export function proactive({ dashboard }: LandingFlags) {
  return {
  title: 'Ele não espera você perguntar',
  intro:
    'Muita ferramenta só responde quando você lembra de abrir. O Tom antecipa o que importa no seu dia.',
  items: [
    {
      title: 'Resumo matinal',
      text: dashboard
        ? 'Um bom dia com a previsão do tempo, a agenda e as tarefas de hoje e as contas que vencem hoje. Você escolhe o horário, e agenda e contas só vêm se houver algo pra mostrar.'
        : 'Um bom dia com a previsão do tempo, as tarefas e compromissos de hoje e as contas que vencem hoje. Você escolhe o horário, e tarefas e contas só vêm se houver algo pra mostrar.',
    },
    {
      title: 'Horário de silêncio',
      text: 'Você escolhe a janela em que ele não manda nada por iniciativa própria. Lembretes que você agendou continuam chegando na hora marcada.',
    },
    {
      title: 'Avisos sobre o seu dinheiro',
      text: 'Quando um padrão nos seus gastos pede atenção, ele te avisa. Sem você precisar perguntar.',
    },
  ],
  } as const;
}

export function howItWorks({ dashboard }: LandingFlags) {
  return {
  title: 'Como funciona',
  steps: [
    {
      title: 'Manda uma mensagem',
      text: 'Texto ou áudio, do jeito que sair. Não precisa seguir formato nenhum.',
    },
    {
      title: 'Ele anota e confirma',
      text: 'Só confirma depois de registrar de verdade. Se errou alguma coisa, é só corrigir na conversa.',
    },
    {
      title: 'Você acompanha',
      text: dashboard
        ? 'No painel web você vê gastos, tarefas, notas e uma linha do tempo da semana.'
        : 'É só perguntar: "o que tenho hoje?", "quanto gastei no mês?". Ele responde na hora.',
    },
  ],
  } as const;
}

export function control({ dashboard }: LandingFlags) {
  return {
    title: 'Seus dados, sob seu controle',
    items: [
      ...(dashboard ? ['Veja o que o Tom lembra de você e apague o que não quiser que ele guarde.'] : []),
      'Desfaz a última coisa que ele anotou, nos 10 minutos seguintes.',
      ...(dashboard ? ['Exporte tudo o que você registrou, em JSON, quando quiser.'] : []),
      'O Tom não conecta na sua conta bancária. Ele só sabe o que você contar.',
    ],
  };
}

export function pricing({ dashboard }: LandingFlags) {
  return {
    title: 'Um preço só, sem plano escondido',
    price: PRICE_LABEL,
    period: '/mês',
    trialLine: `${TRIAL_DAYS} dias de teste para sentir o ritmo antes de pagar.`,
    includes: [
      dashboard ? 'Agenda, tarefas, lembretes, notas e metas pessoais' : 'Compromissos, tarefas, lembretes, notas e metas pessoais',
      'Financeiro pessoal com resumo semanal',
      'Resumo matinal e avisos proativos, com horário de silêncio',
      ...(dashboard ? ['Painel web e exportação dos seus dados'] : []),
    ],
    payment:
      'Pagamento por PIX, boleto ou cartão. Ao fechar, pedimos CPF (ou CNPJ), que é exigência do meio de pagamento.',
  };
}

export function faq({ billing, dashboard }: LandingFlags) {
  return {
  title: 'Perguntas comuns',
  items: [
    {
      question: 'Preciso instalar algum aplicativo?',
      answer:
        dashboard
          ? 'Não. Tudo começa no WhatsApp. O painel no navegador é opcional, e o link de acesso chega pelo próprio WhatsApp.'
          : 'Não. Tudo acontece na conversa do WhatsApp.',
    },
    {
      question: 'Serve pra MEI ou autônomo?',
      answer:
        'Serve pra sua vida como pessoa física, e isso inclui o lado do trabalho: compromissos, tarefas, notas e follow-ups. Não é um sistema de gestão empresarial: não emite nota fiscal e não controla DAS nem fluxo de caixa de empresa.',
    },
    {
      question: 'Ele mexe no meu banco ou paga alguma coisa por mim?',
      answer:
        'Não. O Tom não acessa sua conta bancária e não faz pagamento. Ele registra o que você contar.',
    },
    {
      question: 'Funciona com áudio?',
      answer:
        'Sim. O áudio é transcrito e tratado igual a uma mensagem digitada.',
    },
    {
      question: 'Ele responde a qualquer hora?',
      answer:
        'Sim, 24 horas. Os avisos por iniciativa dele respeitam o horário de silêncio que você escolher.',
    },
    ...(billing
      ? [
          {
            question: 'Como cancelo?',
            answer: 'Avise pelo WhatsApp e uma pessoa do time cuida do cancelamento.',
          },
        ]
      : []),
  ],
  };
}

export const FINAL_CTA = {
  title: 'Manda um oi pro Tom e veja em um minuto.',
  ctaLabel: 'Começar pelo WhatsApp',
};
