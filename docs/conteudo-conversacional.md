# Como dar ao Tom mais conversa natural

Guia prático para acrescentar conhecimento e conteúdo de conversa sem mexer em lógica. Contexto e motivo: ADR 0011 e a
seção "Comunicação do Tom" do `CLAUDE.md`.

## A regra que não muda

O Tom é uma **IA e diz isso sem drama**. Natural não é fingir ser gente: ele não inventa rotina, família, gosto, fome,
sono nem fim de semana. Dá para ser caloroso sem afirmar uma vida que não existe: "tô por aqui, 24 horas" é verdade,
"acabei de almoçar" não é. Os testes barram conteúdo que afirme vida humana.

## Onde cada tipo de conteúdo vive

| Quero acrescentar… | Onde | Exemplo |
|---|---|---|
| Uma **situação de conversa** (como responder a X) | `SCENARIOS` em `packages/core/src/llm/conversation-knowledge.ts` | "Estou ansioso com uma prova" |
| Uma **expressão** brasileira que o Tom deve entender | `EXPRESSIONS` (mesmo arquivo) | "tá osso", "arrasou" |
| Um **assunto delicado** e como evitar problema | `SENSITIVE_TOPICS` (mesmo arquivo) | dinheiro emprestado entre amigos |
| Uma **data comemorativa** por regra | `FIXED_COMMEMORATIVE` ou `describeCommemorativeDate` em `packages/core/src/digest/calendar-dates.ts` | Dia do Professor (15/10) |
| Uma **piada** | `packages/core/src/llm/jokes.ts` (banco curado; o Tom nunca improvisa) | — |
| Um **fato financeiro ou de produtividade** para explicar | `MONEY_KNOWLEDGE` / `TIME_KNOWLEDGE` em `packages/core/src/llm/tom-persona.ts` | "Compra por impulso: esperar 24 horas…" |
| Uma **proposição** (o que o Tom oferece, em pergunta, depois de resolver o pedido) | `PROPOSALS` em `packages/core/src/llm/proposals.ts` | meta nova → lembrete periódico |
| Um **atalho sem IA** (mensagem inteira e exata) | `parse.ts` + `execute.ts` em `packages/core/src/commands/` | `lembretes`, `metas`, `revisão do mês` |

Datas **móveis ou que mudam por ano** nunca vão digitadas no texto: use regra de cálculo (como a Black Friday e o Dia das
Mães já fazem). O Tom recebe, no prompt do dia, só as datas calculadas dos próximos 21 dias.

## Como escrever uma situação

```ts
{
  id: 'ansiedade-prova',                       // único, minúsculo, com hífen
  when: '"tô nervoso com a prova", "amanhã é minha entrevista"',
  how: 'Acolha em meia frase e pergunte se quer ajuda prática (lembrete, separar o material). Sem discurso motivacional.',
  examples: ['Dá um friozinho mesmo. Quer que eu te lembre de revisar hoje à noite?'],
}
```

- **Exemplos ensinam mais que regras.** Escreva 1 ou 2 frases que você gostaria de receber, curtas, no português de
  WhatsApp. Eles mostram o *tom*; o prompt já manda variar as palavras.
- **Um emoji por linha, no máximo.** Nada de "kkk", piada, "prezado" ou "estou à disposição".
- **Nunca copie texto real de uma pessoa.** Reescreva o caso de forma sintética.
- **Conversa não cria nada.** Oferecer lembrete é pergunta; criar é só depois do "sim".

## Como conferir (3 passos)

1. `npm test`: confere tamanho, emoji por linha, frases de atendimento robótico e afirmação de ser humano. Falhou? A
   mensagem diz qual exemplo e por quê.
2. Se a situação importa, **acrescente um caso** em `packages/core/src/eval/golden-set.ts` (área `conversa`) com a regra
   de texto (`text.includesAny` / `text.excludesAny`) do que a resposta deve ou não dizer.
3. `npm run eval:golden` (ou o workflow manual "Eval do golden set") **antes e depois**, e compare a taxa de aprovação.

## Custo

Conversa, proposições e conhecimento entram em **toda** chamada (bloco estável, que é cacheado: o custo extra é na
escrita do cache, e a leitura custa cerca de 10%). Cada um tem teto no teste, de propósito: conversa 11.000 caracteres,
proposições 6.000, conhecimento 8.000. Passar do teto é decisão consciente: se precisar de mais, enxugue algo antigo ou
suba o teto sabendo que cada chamada paga por isso. Não duplique o que a personalidade (`tom-persona.ts`) já cobre
(elogio, erro seu, bronca, dinheiro apertado e desabafo já estão lá).

## O que os testes barram

- **Conhecimento** (`tom-persona.test.ts`): nenhum item com `%` nem `R$`, nem Selic/CDI/IPCA com número. O que muda com o
  tempo (taxa, alíquota, salário mínimo, limite) o Tom busca na hora com `web_search`, nunca recita de cabeça. Também barra
  nome de banco, corretora e ativo (o Tom não recomenda produto).
- **Proposições** (`proposals.test.ts`): `tool` precisa existir no registro; `command` precisa ser reconhecido pelo parser; o
  exemplo é uma pergunta; nada afirma que algo já foi feito ("já guardei", "vou lembrar"); sem valor em reais.
- **Situações** (`conversation-knowledge.test.ts`): sem valor em reais nos exemplos (o modelo poderia repeti-lo como dado
  real da pessoa), sem afirmar vida humana, e "privacidade" nunca afirma criptografia, certificação nem prazo de retenção.

## Atalhos novos (sem IA)

`lembretes`, `notas`, `contas`, `metas`, `hábitos` e `datas` mostram o que a pessoa registrou; `revisão do mês` fecha o
mês (no dia 1, o mês passado inteiro; nos outros, este mês até ontem contra o MESMO trecho do mês passado) e `sugestão`
aponta até 3 próximos passos **só com dado lido** (fonte que falhou nunca vira "você não tem meta"). Só casam como
mensagem inteira; "ideia" e "resumo do mês" ficaram de fora de propósito (ambíguos). Mensagens automáticas que esperam
resposta (lembrete disparado, insight, resumo semanal, aviso de data, reengajamento) agora entram no histórico da conversa,
pra "adia pra amanhã" ou "como assim?" fazerem sentido.

## O que já está lá

Conversa fiada e reciprocidade ("tudo bem?", "e você?"), cansaço, clima do dia (sextou, segundou), notícia boa e triste,
riso e emoji soltos, desistência, mudança de assunto, mensagem longa, perguntas sobre o próprio Tom, ansiedade antes de
evento, pedir opinião, sonho ou plano, curiosidade sobre gasto, "esqueci o que tinha pra fazer", "você consegue…?",
privacidade, voltar depois de sumir, parar mensagens, assuntos
delicados (política, religião, futebol, saúde, relacionamento, conteúdo ofensivo, pedidos fora do foco) e as datas por
vir (feriados nacionais, Dia das Mães, Dia dos Pais, Namorados, Crianças, Black Friday, Páscoa, Réveillon).
