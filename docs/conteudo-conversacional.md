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
| Um **fato financeiro ou de produtividade** para explicar | `buildKnowledgeSection` em `packages/core/src/llm/tom-persona.ts` | — |

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

A seção de conversa entra em **toda** chamada (bloco estável, que é cacheado): hoje ~1.500 tokens estimados, com teto de
8.000 caracteres no teste. Passar do teto é de propósito: se precisar de mais, enxugue algo antigo ou suba o teto
sabendo que cada chamada paga por isso.

## O que já está lá

Conversa fiada e reciprocidade ("tudo bem?", "e você?"), cansaço, clima do dia (sextou, segundou), notícia boa e triste,
riso e emoji soltos, desistência, mudança de assunto, mensagem longa, perguntas sobre o próprio Tom, assuntos
delicados (política, religião, futebol, saúde, relacionamento, conteúdo ofensivo, pedidos fora do foco) e as datas por
vir (feriados nacionais, Dia das Mães, Dia dos Pais, Namorados, Crianças, Black Friday, Páscoa, Réveillon).
