# ADR 0005 — Onboarding turbinado: fuso por DDD, reengajamento, ocupação, link proativo, funil

**Status:** aceito e implementado (2026-10). Escopo: sugestões 3, 4, 5, 6, 7, 9 e 10 da revisão de
onboarding (sugestões 1, 2 e 8 ficaram de fora, não implementadas nesta rodada — não revisitar
sem pedido explícito).

## Contexto

Onboarding (Fase 1, CLAUDE.md) sempre foi mínimo: primeira mensagem pergunta o nome, cria conta,
fim. Uma revisão identificou 10 gaps concretos; o usuário escolheu 7 pra implementar agora. Cada
decisão abaixo corresponde a uma das sugestões, na mesma numeração usada na conversa.

## Decisão 3 — Fuso por DDD em vez de default fixo

`users.timezone` sempre caiu no default da coluna (`'America/Sao_Paulo'`, `0001_init.sql`) —
nunca perguntado, nunca inferido. Qualquer pessoa fora desse fuso (Manaus, Rio Branco, Cuiabá,
Campo Grande, Porto Velho, Boa Vista) tinha "ontem"/"hoje de manhã" resolvido errado desde o
primeiro dia, silenciosamente — o tipo de erro que o CLAUDE.md pede pra nunca deixar passar batido
em dado de data/hora.

`packages/db/src/timezone-from-ddd.ts` (`inferTimezoneFromWhatsappNumber`) extrai o DDD de um
número brasileiro (DDI 55, 12 ou 13 dígitos) e mapeia as exceções conhecidas — Acre, Amazonas,
Mato Grosso, Mato Grosso do Sul, Rondônia, Roraima — pro fuso certo; todo o resto (incluindo
Fernando de Noronha, que compartilha DDD com Recife, e a pequena área de Eirunepe no Amazonas, que
compartilha DDD com o resto do estado) cai no default, documentado como aproximação conhecida, não
como erro silencioso. `createUser` (`packages/db/src/repositories/users.ts`) passa a gravar isso
na criação — número não-brasileiro continua caindo no mesmo default de sempre, sem regressão.

## Decisão 4 — Reengajamento automático (2h / 24h)

Não existia follow-up se a pessoa parasse no meio do onboarding (ex.: perguntada o nome, nunca
respondeu) — a conversa simplesmente morria. Nova fila BullMQ `onboarding-nudge`
(`packages/core/src/queues/definitions.ts`): dois jobs com delay (2h, 24h) agendados em
`apps/worker/src/handlers/incoming-message.ts` toda vez que o usuário tem onboarding incompleto —
`jobId` determinístico (`onboarding-nudge:<estágio>:<userId>`) faz o BullMQ dedupar sozinho, então
chamar isso em toda mensagem (não só na primeira) é seguro e não duplica agendamento.

O handler (`apps/worker/src/handlers/onboarding-nudge.ts`) **revalida**
`onboarding_completed_at` no momento da execução antes de mandar — cobre o caso comum de a pessoa
completar o cadastro entre o agendamento e o disparo, sem precisar cancelar o job agendado.
Mensagens (`packages/core/src/onboarding/nudge-message.ts`) são template fixo com variações (mesmo
padrão de `insights/message.ts`), não geração por LLM.

## Decisão 5 — Ocupação capturada uma vez, nunca perguntada separado

Categorização de gasto começava "zerada" pra toda conta nova. `users.occupation` (nova coluna,
nullable) é preenchida só se a pessoa mencionar o que faz espontaneamente durante o onboarding —
`complete_onboarding` aceita um parâmetro opcional `occupation`; o system prompt deixa explícito
que o Tom nunca pergunta isso separado nem insiste (é bônus, não formulário). Quando existe, entra
como uma linha de contexto no prompt base pra ajudar a categorização — nunca é citada de volta pra
pessoa sem necessidade.

## Decisão 6 — Link do painel mandado proativamente ao fim do onboarding

`send_dashboard_login_link` sempre foi reativo (só respondia se perguntado) — a maioria nunca
saberia que existe um painel. O bloco de onboarding no system prompt agora instrui o Tom a chamar
essa tool logo depois de `complete_onboarding` e incluir o link na mesma mensagem de boas-vindas,
de passagem. Não muda a tool em si (continua existindo pro caso reativo), só quando ela é chamada.

## Decisão 7 — Reforço de valor só no primeiro dia

Depois da primeira ação confirmada (gasto, tarefa, lembrete), não havia nenhum fechamento de "era
só isso mesmo" — a confirmação era só transacional. Nova seção `# Primeiro dia` no system prompt,
ativa só quando `daysSince(created_at) === 0` (aproximação por dia corrido, não por "primeira ação
de verdade" — não há tracking de "já é a primeira ação" no banco, e não cabia adicionar isso só
pra essa sugestão): instrui UM reforço curto na primeira confirmação da conversa, nunca repetido
nas confirmações seguintes da mesma conversa.

## Decisão 9 — Funil de onboarding no admin, por variante

Admin só mostrava volume (`onboarding_completed_at` null/not-null como contagem solta). Nova
`getOnboardingFunnel()` (`packages/db/src/repositories/users.ts`) lê a tabela `users` inteira e
agrega em JS por variante (total, completos, taxa, estagnados há mais de 24h sem completar, tempo
médio até completar) — aceitável no tamanho atual da base, mesmo raciocínio de `countAllRows`
(admin não é feature de produto, é instrumentação — `0004_admin.sql`). Renderizado em
`/admin` como tabela, com a ressalva explícita de que é leitura manual, sem teste de significância
estatística automático — não fabricar confiança que a amostra ainda não sustenta (mesmo principio
de honestidade do ADR 0004: nunca inventar certeza que não existe).

## Decisão 10 — Variante de abertura como split determinístico, não aleatório

Pra comparar "nome primeiro" (atual) com "ação primeiro" (convidar a pessoa a já contar um gasto/
tarefa, pedindo o nome de passagem) sem depender de infra de experimento real (que não existe),
`users.onboarding_variant` é decidido em `createUser` por `assignOnboardingVariant`
(`packages/db/src/onboarding-variant.ts`) — par/ímpar do último dígito do número de WhatsApp.
Determinístico de propósito (não `Math.random`): mesma pessoa sempre cai na mesma variante mesmo
em uma segunda chamada, e o resultado é reproduzível em teste. A única diferença de texto entre as
duas variantes é o que a mensagem de abertura convida primeiro — ocupação oportunista e link do
painel (decisões 5 e 6) são iguais nas duas, de propósito, pra isolar a variável testada.

## Consequências

- `users` ganha `occupation` e `onboarding_variant` (migration `0014_onboarding_improvements.sql`,
  default `'ask_name_first'` pra linha existente).
- Nova fila `onboarding-nudge` no worker (sem `onExhausted` — ninguém espera essa mensagem em
  tempo real, mesmo raciocínio de `weeklyDigestGenerate`/`insightsSweep`).
- Admin (`/admin`, `/admin/contacts`) ganha o funil por variante e a coluna de ocupação.
- Quando a amostra por variante crescer o suficiente pra decidir entre as duas, a decisão final é
  humana, lendo a tabela do funil — não automática.
