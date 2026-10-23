/**
 * Banco curado de piadas do Tom (2026-10, pedido do dono do produto: piada só
 * quando a pessoa pede, e só piada boa — "já vi algumas sofríveis"). Fica em
 * código, servido pela tool `tell_joke`, por dois motivos: o modelo
 * improvisando piada costuma ser fraco e repetir sempre a mesma, e aqui a
 * seleção é aleatória de verdade e dá pra evitar repetição na conversa.
 *
 * Critérios pra entrar no banco: curta (cabe numa tela de WhatsApp), graça
 * na observação ou na virada (não em trocadilho forçado), funciona sem
 * explicação, e nada que mexa com grupos de pessoas (raça, gênero, religião,
 * orientação, região, aparência, deficiência) nem política. `\n` separa a
 * preparação da virada — o Tom manda o texto exatamente assim.
 */
export const JOKE_THEMES = ['dinheiro', 'trabalho', 'tempo', 'dia_a_dia', 'tecnologia', 'tom', 'classicas'] as const;
export type JokeTheme = (typeof JOKE_THEMES)[number];

export interface Joke {
  id: string;
  theme: JokeTheme;
  text: string;
}

export const JOKES: Joke[] = [
  // dinheiro
  { id: 'din-01', theme: 'dinheiro', text: 'Dinheiro não traz felicidade.\nMas já vi muita gente morrendo de saudade dele no dia 28.' },
  { id: 'din-02', theme: 'dinheiro', text: 'Salário é que nem visita:\nchega animado, faz festa e vai embora antes de você se acostumar.' },
  { id: 'din-03', theme: 'dinheiro', text: 'Parcelei em 12 vezes porque o eu do futuro é rico.\nSpoiler: ele está tão apertado quanto eu.' },
  { id: 'din-04', theme: 'dinheiro', text: 'Meu planejamento financeiro tem um único bug:\no mês tem 30 dias e o salário dura 12.' },
  { id: 'din-05', theme: 'dinheiro', text: 'A conta de luz é a única coisa que dá choque sem encostar em você.' },
  { id: 'din-06', theme: 'dinheiro', text: 'Poupança é o lugar onde o dinheiro fica esperando você precisar dele pra trocar o pneu do carro.' },
  { id: 'din-07', theme: 'dinheiro', text: 'Dia 5 é o único dia do mês em que você é rico por uns 40 minutos,\naté os boletos começarem a chegar.' },
  { id: 'din-08', theme: 'dinheiro', text: "'Só uma comprinha' é a frase mais perigosa do comércio.\nA segunda mais perigosa é 'tá em promoção, mas só hoje'." },
  { id: 'din-09', theme: 'dinheiro', text: "Não existe despertador mais eficiente do que a notificação 'seu saldo está baixo'." },

  // trabalho
  { id: 'trab-01', theme: 'trabalho', text: 'Meu ciclo de produtividade tem três fases: planejar, procrastinar e entrar em pânico.\nA terceira é de longe a mais eficiente.' },
  { id: 'trab-02', theme: 'trabalho', text: 'Lista de tarefas é um gênero literário:\nficção cheia de esperança.' },
  { id: 'trab-03', theme: 'trabalho', text: 'Prazo é a melhor ferramenta de produtividade já inventada.\nNinguém faz nada até ele chegar perto.' },
  { id: 'trab-04', theme: 'trabalho', text: 'Toda reunião que poderia ter sido um e-mail tem um lado bom:\né a única em que todo mundo concorda — ninguém queria estar ali.' },
  { id: 'trab-05', theme: 'trabalho', text: 'No Brasil, o ano só começa depois do Carnaval.\nE termina no dia 20 de dezembro.' },
  { id: 'trab-06', theme: 'trabalho', text: 'Café não resolve problema nenhum.\nMas deixa você cheio de ótimas ideias de como resolver todos.' },

  // tempo
  { id: 'tem-01', theme: 'tempo', text: "'Cinco minutinhos' de rede social é a unidade de tempo mais elástica conhecida pela ciência." },
  { id: 'tem-02', theme: 'tempo', text: "Planejei dormir cedo.\nMeu cérebro, às 23h: 'e se a gente lembrasse de tudo o que aconteceu em 2014?'" },
  { id: 'tem-03', theme: 'tempo', text: 'Acordar cedo é fácil: eu acordo às 6h.\nO corpo é que só chega às 8h.' },
  { id: 'tem-04', theme: 'tempo', text: "'Já tô saindo' é a medida de tempo mais enganosa que existe.\nPode significar dois minutos ou o começo de um banho." },
  { id: 'tem-05', theme: 'tempo', text: 'O domingo às 17h tem uma física própria:\nas horas passam o dobro da velocidade.' },
  { id: 'tem-06', theme: 'tempo', text: 'Toda dieta começa na segunda.\nPor isso a segunda é o dia mais sobrecarregado da semana: carrega os planos de todo mundo.' },

  // dia a dia
  { id: 'dia-01', theme: 'dia_a_dia', text: 'Supermercado é o lugar onde você entra pra comprar leite\ne sai com 14 coisas que não têm nada a ver com leite.' },
  { id: 'dia-02', theme: 'dia_a_dia', text: 'Pão de queijo é a prova de que existe aproveitamento de 100%:\nninguém come um só.' },
  { id: 'dia-03', theme: 'dia_a_dia', text: "A geladeira cheia e a frase 'não tem nada pra comer' convivem em paz desde que a geladeira foi inventada." },
  { id: 'dia-04', theme: 'dia_a_dia', text: 'Bastam três gotas de chuva pro trânsito dobrar de tamanho.' },
  { id: 'dia-05', theme: 'dia_a_dia', text: 'Todo mundo tem aquele carregador que só funciona num ângulo específico,\ne uma relação de respeito com ele.' },

  // tecnologia
  { id: 'tec-01', theme: 'tecnologia', text: "Áudio de 4 minutos no WhatsApp é a versão moderna do 'vou te contar uma coisa rapidinho'." },
  { id: 'tec-02', theme: 'tecnologia', text: "A maior mentira da internet continua sendo 'li e aceito os termos de uso'." },
  { id: 'tec-03', theme: 'tecnologia', text: 'Celular com 1% de bateria é a única coisa capaz de me fazer correr em linha reta até a tomada.' },

  // o próprio Tom
  { id: 'tom-01', theme: 'tom', text: 'Sou uma IA: não durmo, não tiro férias e nunca esqueço um aniversário.\nMeu único defeito é não conseguir comer o bolo.' },
  { id: 'tom-02', theme: 'tom', text: 'Dizem que a IA vai roubar todos os empregos.\nEu só quero um: lembrar que você tem dentista na terça.' },
  { id: 'tom-03', theme: 'tom', text: "Sabe o que mais me deixa feliz no mundo?\nQuando você responde 'já fiz'." },

  // clássicas
  { id: 'cla-01', theme: 'classicas', text: "O que o zero disse pro oito?\n'Bonito cinto!'" },
  { id: 'cla-02', theme: 'classicas', text: "O que a impressora disse pra outra?\n'Essa folha é sua ou é impressão minha?'" },
  {
    id: 'cla-03',
    theme: 'classicas',
    text: 'Um senhor entra na farmácia:\n— Moça, vocês têm remédio pra falta de memória?\n— Temos sim.\n— Ótimo, quero um.\n— Pra quem?\n— Pra quem o quê?',
  },
  {
    id: 'cla-04',
    theme: 'classicas',
    text: "A professora pergunta:\n— Joãozinho, o que você quer ser quando crescer?\n— Feliz.\n— Você não entendeu a pergunta.\n— A senhora não entendeu a vida.",
  },
  { id: 'cla-05', theme: 'classicas', text: 'Qual é o animal mais antigo do mundo?\nA zebra: ainda está em preto e branco.' },
];

export interface PickedJoke extends Joke {
  /** true quando todas as do tema já tinham sido contadas e esta é uma repetição. */
  repeated: boolean;
}

/**
 * Sorteia uma piada do tema (ou de todas, sem tema) fora das já contadas. Se
 * todas do tema já foram contadas, repete uma do tema e sinaliza `repeated`
 * pro Tom assumir isso com naturalidade em vez de fingir que é nova.
 */
export function pickJoke(theme?: JokeTheme, alreadyToldIds: string[] = [], random: () => number = Math.random): PickedJoke {
  const themed = theme ? JOKES.filter((joke) => joke.theme === theme) : JOKES;
  const fresh = themed.filter((joke) => !alreadyToldIds.includes(joke.id));
  const pool = fresh.length > 0 ? fresh : themed;
  const joke = pool[Math.floor(random() * pool.length)]!;
  return { ...joke, repeated: fresh.length === 0 };
}
