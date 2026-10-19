# ZapBuddy

Parceiro pessoal 24 horas via WhatsApp com IA para gestão do tempo (agenda e compromissos pessoais), organização de tarefas e notas pessoais, e gestão financeira. Público: consumidores finais (B2C), pessoas físicas. Diferencial central: IA **proativa** (antecipa e sugere), não só reativa a comandos. Documentos entram como suporte a esses três pilares (ex.: comprovante de um gasto), não como um quarto pilar independente.

**Posicionamento (2026-10, reafirmado pelo dono do produto — B2C, consumidor final, não B2B):**

Visão informal: *"o Tom é seu amigo 24hs por dia, que te ouve, te responde, gera sugestões, te
ajuda a lembrar do que você falou, seja pessoal, profissional, notas, agenda, compromisso ou
financeiro."*

Formal: *"O foco do Tom é de apoiar na gestão do tempo, como agenda e compromissos pessoais,
organização de tarefas e notas pessoais, e gestão financeira, ajudando em parceria com você todo
dia 24hs."*

"Nicho inicial: autônomos e pequenos negócios (MEI/PJ)" (acima) é o perfil de quem adota primeiro,
não uma venda B2B — quem paga e usa é a pessoa física, no pessoal e no profissional dela, o que já
inclui o MEI/PJ como só mais um aspecto da vida de quem usa, não um produto de gestão empresarial.
Documentos entram como suporte aos três pilares (ex.: comprovante de um gasto), não como um quarto
pilar independente.

## Público e escopo (2026-10, motivo documentado)

Decisão do usuário: o público é B2C, não MEI/PJ. O foco do Tom é:

- Gestão do tempo: agenda e compromissos pessoais
- Organização de tarefas e notas pessoais
- Gestão financeira pessoal
- Parceiro disponível 24 horas por dia, sempre pelo WhatsApp

Itens de negócio (fluxo de caixa de MEI/PJ, DAS, nota fiscal) não são nicho do produto. Não revisitar esse recorte sem pedido explícito do usuário.

## Diferenciais de assistente pessoal (2026-10, pedido do dono do produto)

Entram no código, por pedido explícito, mesmo fora da ordem de fases:

- **Resumo matinal** (fila `morning-digest-generate`, 8h local): agenda do dia, tarefas de hoje e atrasadas, contas a
  vencer em até 3 dias. Uma mensagem só; sem nada pra mostrar, não manda nada.
- **Contas recorrentes** (`recurring_bills`, tools `create_recurring_bill`/`list_recurring_bills`/`cancel_recurring_bill`):
  só o que a pessoa informou. Nunca vira pagamento sozinho.
- **Metas com valor** (`goals`, tools `create_goal`/`add_goal_progress`/`list_goals`): valor-alvo e valor guardado são
  os declarados pela pessoa, nunca estimados. Nunca prometer rendimento. Distinta de **metas pessoais** (`personal_goals`,
  tools `create_personal_goal`/...), que são qualitativas e sem valor.
- **Horário de silêncio** (`users.quiet_hours_start/end`, tool `set_quiet_hours`): bloqueia só mensagens proativas
  (resumo matinal, insight, resumo semanal). Lembretes que a pessoa agendou continuam chegando na hora marcada.
  Insight e resumo semanal que cairiam dentro da janela são pulados naquele dia, não reagendados.
- **Resumo semanal comparativo**: mostra variação percentual contra a semana anterior, só quando as duas têm gasto.
- **Busca em notas** (`list_notes` com `query`) e **conflito de agenda** (`create_calendar_event` devolve `conflicts`,
  sem bloquear a criação).
- **Desfazer** (`undo_last_action`): reverte só a última criação da pessoa nos últimos 10 minutos, lendo o log de tool
  calls. Decisão: desfazer em vez de confirmação antes de salvar, para não travar a conversa. Não desfaz duas vezes.
- **Exportação** (`/api/dashboard/export`, JSON): tudo que a conta registrou.
- **Não implementado**: tempo de deslocamento entre compromissos (não há dado de localização).

Migration `0019_personal_assistant.sql` precisa ser aplicada no Supabase antes do deploy (a `0018` é de `personal_assistant_expansion`, da `main`).

## Stack (decidida — não revisitar sem motivo forte)

- **Backend:** Node.js + TypeScript
- **Banco/Auth/Storage:** Supabase (Postgres + Storage + Auth) — MCP já disponível neste ambiente
- **Deploy (API + dashboard web):** Vercel — MCP já disponível neste ambiente
- **Fila assíncrona:** BullMQ + Redis (transcrição de áudio, ações demoradas)
  - **Amendamento 2026-10 (motivo documentado, incidente):** o banco Redis gerenciado (Upstash) foi
    criado e, em menos de 48h, estourou o limite do plano Fixed — travando até o `AUTH`, o que
    derrubou webhook e worker ao mesmo tempo (nenhuma mensagem processada, silêncio total). Causa
    raiz: 11 `Worker` do BullMQ checando job "travado" a cada 30s cada, 24/7, mesmo sem job ativo
    (overhead de infra ociosa, não tráfego de usuário real — ver `apps/worker/src/worker.ts`).
    Corrigido: `removeOnComplete`/`removeOnFail` (`packages/core/src/queues/definitions.ts`),
    `stalledInterval` e heartbeat esticados pra 1h/2h (decisão explícita, aceita o trade-off de até
    1h pra recuperar um job travado por crash em troca de ~99% menos comando/dia). `REDIS_URL`
    migrada pra uma instância Upstash nova (`allowing-chow-82780.upstash.io`) depois do banco
    anterior ficar inacessível mesmo após as correções de código.
- **Canal:** WhatsApp Cloud API oficial (Meta) é o canal **padrão e obrigatório** para qualquer usuário real/dados financeiros.
  - **Amendamento 2026-10 (motivo documentado):** suporte opcional à Evolution API (gateway Baileys self-hosted, mesma usada pelo ZapScript em `deploy/evolution-oci`) como canal alternativo via `WHATSAPP_CHANNEL_PROVIDER=evolution`, só para ambientes de teste/staging ou contingência operacional (ex.: aprovação do número oficial atrasada). Risco de ban e fragilidade para dado financeiro continuam valendo para esse caminho — por isso ele nunca é o default (`WHATSAPP_CHANNEL_PROVIDER` default é `cloud-api`) e qualquer deploy de produção com usuários reais deve permanecer em `cloud-api`. Não é dual-send automático: é uma troca manual de canal via env var.
- **LLM:** Claude (Anthropic), via tool use/function calling — cada "assessor" é um conjunto de tools, não um serviço separado.
  - **Amendamento 2026-10 (motivo documentado):** fallback automático pra OpenAI (`OPENAI_API_KEY`, reaproveitada do fallback de transcrição) quando o Anthropic falha por qualquer motivo — já causou indisponibilidade total em produção (créditos esgotados, sem rede de segurança). Claude continua o provider primário e decidido; OpenAI só assume quando o Anthropic erra, nunca por preferência/custo. Arquitetura em `packages/core/src/llm/providers/` (`config.ts` = ordem de prioridade, `orchestration.ts` = tenta em ordem e loga qual provider respondeu), inspirada no sistema multi-provider de `mycollect` (`src/lib/vision/providers/`). Cada provider roda seu próprio loop de tool-use e usa a mesma `runToolCall()` — a regra não-negociável abaixo (nunca inventar dado financeiro) vale igual não importa qual LLM decidiu chamar a tool.
- **Dashboard web:** Next.js (App Router), login via magic link disparado pelo WhatsApp.
  - **Amendamento 2026-10 (motivo documentado, correção de doc):** a frase "somente leitura" não
    reflete o código há um tempo — Fase 2/3 já trouxeram escrita real (criar/revogar chave de API,
    criar/desabilitar webhook). Não é uma decisão nova, é a doc alcançando o que já estava
    implementado.

## Arquitetura (fixa)

```
WhatsApp Cloud API → webhook (Vercel function)
  → fila (BullMQ) para áudio/transcrição e ações lentas
  → orquestrador LLM (Claude + tools)
  → módulos de ação (finance, tasks, reminders)
  → Postgres (Supabase)
  → resposta ao usuário no WhatsApp
```

Regra de design não-negociável: a IA nunca "inventa" dado financeiro. Toda transação/tarefa é persistida como registro estruturado antes de qualquer resposta confirmar a ação. Contexto de conversa (curto prazo), memória de longo prazo e dados estruturados ficam em camadas separadas (ver amendamento abaixo).

Logar toda tool call da IA (nome + parâmetros + resultado) desde o primeiro commit — é o principal insumo de debug de erros de interpretação de linguagem natural.

**Amendamento 2026-10 (motivo documentado — memória expandida):** três camadas de memória, cada
uma com um propósito e um limite claro, pra não misturar "lembrar de algo" com "registrar dado
financeiro":
1. **Conversa de curto prazo** (Redis, `conversation-context.ts`) — últimas 40 trocas / 24h de
   inatividade. Só dá ao LLM continuidade de conversa, nunca é fonte de verdade.
2. **Fatos de longo prazo** (`memory_facts`, Postgres) — o Tom guardando algo SOBRE a pessoa
   (rotina, preferência, relação), via tool `remember_fact`/`forget_fact`, auditado como qualquer
   outra tool call. Nunca substitui `record_transaction` ou qualquer tool estruturada — é contexto
   conversacional persistente, não dado estruturado. Injetado no system prompt (até 30 fatos mais
   recentes), visível e editável pelo usuário no dashboard ("O que o Tom lembra de você").
3. **Notas pessoais** (`notes`, Postgres) — a PESSOA anotando algo pra si mesma ("anota aí: ..."),
   via `create_note`/`list_notes`/`delete_note`. Diferente de tarefa (sem `due_at`, sem conceito de
   concluir) e diferente de fato de memória (é a pessoa anotando, não o Tom lembrando sozinho).

## MVP — escopo travado (Fase 1)

Incluído:
1. Onboarding conversacional (primeira mensagem no WhatsApp = cadastro, sem app)
2. Financeiro básico: registro de gasto/receita por texto ou áudio, categorização automática via IA, resumo diário/semanal
3. Tarefas e lembretes: criar/listar/concluir por mensagem, lembrete agendado
4. Dashboard web read-only (gastos + tarefas), login por magic link

Explicitamente fora do MVP (não implementar até Fase 2+):
- Open Finance / conexão bancária real
- Google Agenda
- Upload e organização de documentos
- Multiusuário / conta compartilhada
- Cobranças a terceiros, emissão de nota fiscal
- Qualquer canal além de WhatsApp

## Roadmap pós-MVP

- **Fase 2:** Open Finance via parceiro (Pluggy/Belvo — não integração direta com bancos), Google Agenda, documentos com storage + busca, multiusuário
- **Fase 3:** insights proativos de IA (alertas preditivos, sugestões de economia), cobranças, nota fiscal, programa de indicação, API/webhooks públicos

**Amendamento 2026-10 (motivo documentado):** gate de retenção do MVP confirmado cumprido fora
deste repo — autorizada a entrada em código de Fase 2. Implementadas nesta rodada: multiusuário
(conta compartilhada via convite — fundação pras outras duas, ver `docs/adr/0002-*.md`),
documentos com storage + busca, Google Agenda. **Open Finance explicitamente fora desta rodada**
— decisão do usuário, continua não implementado. Não revisitar esse recorte sem pedido explícito.

**Amendamento 2026-10 (motivo documentado, Fase 3):** implementadas nesta rodada: insights
proativos de IA (sinal determinístico + template, sem nova chamada ao LLM — ver
`docs/adr/0003-*.md`), programa de indicação, API pública (só leitura) + webhooks. **Cobranças a
terceiros e nota fiscal explicitamente fora desta rodada** — nenhum provedor de
pagamento/emissão fiscal foi decidido pelo usuário, e os dois exigem credenciais reais de um
provedor pra não virar uma simulação enganosa (cobrança que não move dinheiro de verdade; nota
fiscal é documento regulado, não algo pra simular). Continuam não implementados até haver
provedor + decisão explícita — não revisitar esse recorte sem pedido explícito.

## Pesquisa autônoma e aprendizado contínuo (2026-10, motivo documentado)

**Exceção explícita ao gating de fases abaixo** ("nenhuma feature de Fase
2/3 entra em código antes do MVP validar retenção básica"): dono do
produto pediu essa entrada antecipada mesmo sabendo do conflito com a
regra — decisão dele, registrada aqui em vez de silenciosamente ignorada.
Não é precedente pra pular o gating de novo sem o mesmo tipo de pedido
explícito.

Escopo do que entra:
1. **Tool `web_search`** (`packages/core/src/llm/tools/web-search.ts`): dá
   ao Tom capacidade de buscar na web durante a conversa — pra responder
   dúvida geral fora do domínio financeiro/tarefas (ex.: "o que é Tesouro
   Selic", "como funciona o FGTS") e pra identificar um estabelecimento
   desconhecido antes de escolher categoria de gasto (reaproveita a mesma
   tool, não é um pipeline separado). Passa por `runToolCall()` igual
   qualquer outra tool — logada, nunca usada pra inventar/confirmar dado
   financeiro por conta própria (a regra não-negociável original continua
   valendo: quem persiste a transação é sempre `record_transaction`).
2. **Base de conhecimento (`knowledge_entries`, pgvector)**: cache +
   RAG simples das buscas feitas (por usuário em conversa, por pesquisa
   proativa, por apoio à categorização) — evita repetir a mesma busca e dá
   contexto reaproveitável. Embeddings via OpenAI (reaproveita
   `OPENAI_API_KEY`, já presente pelo fallback de LLM/transcrição — mesmo
   padrão de reúso dos amendamentos anteriores).
3. **Job periódico de pesquisa proativa** (fila BullMQ
   `proactive-research`, semanal): pesquisa uma lista fixa de temas do
   nicho (organização financeira pessoal, gestão do tempo e rotina) e
   alimenta a base de conhecimento — não envia nada ao usuário sozinho,
   só amplia repertório pra uso futuro em conversa.
4. **Loop de feedback sobre interpretação** (fila BullMQ
   `interpretation-feedback`, semanal): agrega `tool_call_logs` (já exigido
   desde o primeiro commit) em estatísticas de erro por tool, grava em
   `interpretation_insights`. É só um relatório pra revisão humana — nunca
   ajusta prompt/regra sozinho; qualquer mudança em `system-prompt.ts` a
   partir disso é feita por uma pessoa, em PR separado.

Explicitamente **não** implementado agora (ficaria por conta de uma
decisão de infra/orçamento separada, não cabe nesta entrada):
- Fine-tuning/treino de modelo próprio de verdade. Só existe o script de
  **exportação de dataset** (`packages/db/scripts/export-finetune-dataset.ts`),
  que prepara os dados — rodar um job de fine-tuning de verdade e decidir
  qual modelo treinar fica pra depois.

Config nova: `WEB_SEARCH_API_KEY` (Tavily) — opcional; sem ela, a tool
`web_search` falha de forma controlada (tool loga erro, Tom explica que
não conseguiu buscar agora, sem inventar resposta).

## Vendas, onboarding e indicação proativa (2026-10, motivo documentado)

Decisão do usuário: o Tom passa a vender a continuidade da assinatura e pedir indicação de forma
proativa (antes, `get_referral_info` só respondia se perguntado, e não havia nenhum momento de
venda). Detalhe completo em `docs/adr/0004-vendas-onboarding-indicacao.md` — resumo:

- **Sem preço fechado e sem cobrança real nesta rodada** — nenhum provedor de pagamento decidido.
  O Tom captura intenção ("quero continuar"/"quero cancelar") via tool `register_plan_intent`,
  nunca cobra nem cancela nada sozinho; um humano trata manualmente pelo admin (mesmo padrão já
  usado por `plan_status`). Não revisitar preço/provedor sem decisão explícita do usuário.
- **Trial de 7 dias**, calculado a partir de `users.created_at` — sem convite de venda antes do
  5º dia, "prepara o terreno" entre o 5º e o 7º, convite direto a partir do 7º (só pra quem
  continua em `plan_status = 'trial'`).
- **Straight Line System (Jordan Belfort) adaptado, não copiado**: aproveita certeza construída em
  fato real + convite único + loop de objeção limitado a uma volta; descarta de propósito urgência
  fabricada, prova social inventada e insistência além da segunda recusa — isso violaria a regra
  de nunca inventar dado/contexto e o tom de "parceiro caloroso" já fixado.
- **Indicação proativa, sem recompensa concreta** — decisão explícita de deixar a recompensa pra
  decidir depois; o Tom pode sugerir indicar alguém num momento positivo da conversa, mas nunca
  promete prêmio/desconto que não existe.
- **Cancelamento**: uma tentativa de retenção genuína, nunca duas — simetria com a regra do
  convite de venda.

## Onboarding turbinado (2026-10, motivo documentado)

Decisão do usuário: implementar 7 das 10 sugestões de uma revisão de onboarding (sugestões 3, 4,
5, 6, 7, 9 e 10 — 1, 2 e 8 ficaram de fora, não implementadas). Detalhe completo em
`docs/adr/0005-onboarding-turbinado.md` — resumo:

- **Fuso por DDD** (`timezone-from-ddd.ts`), não mais default fixo `America/Sao_Paulo` pra todo
  mundo — cobre as exceções conhecidas (AC, AM, MT, MS, RO, RR); Fernando de Noronha e a região de
  Eirunepe (AM) ficam como aproximação documentada, não há como distinguir só pelo DDD.
- **Reengajamento automático** (fila `onboarding-nudge`, 2h e 24h) pra quem trava no meio do
  onboarding — revalida `onboarding_completed_at` antes de mandar, nunca manda se já completou.
- **Ocupação opcional** (`users.occupation`) capturada só se mencionada espontaneamente — nunca
  perguntada separado, nunca repetida de volta pra pessoa sem necessidade.
- **Link do painel proativo**: `send_dashboard_login_link` chamado pelo próprio Tom logo depois do
  `complete_onboarding`, não só quando perguntado.
- **Reforço de "primeiro dia"**: uma frase de fechamento de valor na primeira confirmação do dia
  da criação da conta, nunca repetida na mesma conversa.
- **Funil de onboarding no admin**, por variante — leitura manual, sem teste de significância
  estatística automático (mesma honestidade de não inventar confiança do ADR 0004).
- **Variante de abertura A/B** (`onboarding_variant`): split determinístico por número de WhatsApp
  (par/ímpar do último dígito, nunca aleatório) entre "nome primeiro" (controle) e "ação primeiro"
  — decisão de qual vence fica pra quando a amostra crescer, lida manualmente no funil.

## Expansão B2C — datas importantes, metas, carreira e timeline (2026-10, motivo documentado)

Decisão do usuário: implementar as sugestões A (novos especialistas/tool-clusters), B (cobrir
"pessoal" de verdade), C (proatividade com a memória de longo prazo) e D (produto/UX) de uma
rodada de brainstorm feita após reafirmar o posicionamento B2C. Resumo do que entrou:

- **Datas importantes** (`important_dates`, migration `0018`) — recorrente ano a ano (month/day,
  não uma data completa), via `remember_important_date`/`list_important_dates`/
  `forget_important_date`. O sweep horário do worker (`insights-sweep.ts`, reaproveitando a mesma
  varredura da Fase 3) manda o lembrete sozinho no dia certo, no fuso de cada conta — idempotente
  por ano via `important_date_logs`. Diferente de `create_calendar_event` (evento único, não
  recorrente).
- **Metas pessoais/profissionais** (`personal_goals`, migration `0018`) — meta qualitativa sem
  prazo único ("quero ler mais", "fechar mais clientes"), via `create_personal_goal`/
  `list_personal_goals`/`complete_personal_goal`/`delete_personal_goal`. Diferente de `tasks`
  (tem `due_at`, é "a fazer até tal dia") e de `notes` (meta tem status/acompanhamento, nota é só
  texto solto).
- **Carreira/profissional** — sem tabela nova: `notes`/`create_personal_goal`/
  `create_calendar_event` já cobrem (reunião, entrevista, follow-up profissional) — só o
  system prompt foi ajustado pra convidar esse uso explicitamente, em vez de ficar implícito.
- **Resumo semanal turbinado** — `formatWeeklyDigestMessage` (digest/message.ts) ganhou um
  parâmetro opcional de contadores não-financeiros (tarefa pendente, meta em andamento, nota nova
  na semana) — "lembra de tudo", não só financeiro. Reusa dado que já existia, zero query nova
  além de contagens simples.
- **Busca em notas** — `list_notes` (tool e repo) ganhou um parâmetro `query` opcional (ILIKE
  simples, sem pgvector — nota é texto curto, substring já resolve).
- **Dashboard** — seções novas "Metas pessoais" e "Datas importantes" (mesmo padrão de
  criar/listar/apagar via form, já usado por notas/fatos), e "O que aconteceu essa semana": linha
  do tempo unificada mesclando transação/tarefa/nota/fato/meta recentes, montada por uma função
  pura testável (`apps/web/app/dashboard/timeline.ts`) — zero query nova, só reorganiza dado já
  buscado na própria página.

**Conscientemente fora desta rodada** (não é esquecimento, é escopo cortado na hora de implementar
pra não inflar isto além do que dá pra validar de uma vez):
- **Hábitos/rotina com acompanhamento** (streak, check-in recorrente tipo "fui pra academia hoje")
  — viraria uma feature própria (tabela + lógica de streak + prompt periódico), não só uma tool a
  mais; por ora esse tipo de relato cai em `create_note`/`remember_fact`, sem rastreamento de
  constância dedicado.
- **Lembrete disparado por contexto de conversa** ("me lembra de ligar pro João quando eu disser
  que terminei a reunião") — exigiria uma infra de gatilho conversacional que não existe
  (lembrete hoje é sempre por data/hora, `reminders.remind_at`); fica pra quando houver desenho
  concreto de como isso funcionaria sem ambiguidade.
- **Datas importantes injetadas automaticamente em todo system prompt** (como `memory_facts`) —
  decisão deliberada de deixar como tool consultada sob demanda (`list_important_dates`), não
  auto-injetada: a maioria das datas guardadas é irrelevante no dia a dia da conversa, e
  auto-injetar todas infla token de toda mensagem por pouco ganho — o sweep proativo já cobre o
  caso que importa (avisar no dia certo).

## Cadeia de IA — cache em camadas, effort e correções de estilo (2026-10, motivo documentado)

Decisão do usuário: executar as 5 sugestões de performance/custo levantadas numa revisão da cadeia
de modelos, mais dois bugs reportados a partir de print real de conversa no WhatsApp (mensagem sem
quebra de linha, mesmo emoji repetido sempre). Resumo do que entrou:

1. **Cache em camadas no system prompt** (`system-prompt.ts`: `buildSystemPromptBlocks`,
   `anthropic-provider.ts`) — antes, a hora atual ("Agora é...") ficava interpolada no meio do
   prompt, mudando a cada mensagem e invalidando o cache inteiro mesmo entre mensagens seguidas da
   MESMA conversa (só reaproveitava dentro do mesmo turno, nas até 6 iterações do loop). Agora o
   prompt é montado em 3 blocos — `stable` (igual pra essa pessoa em qualquer mensagem),
   `semiStable` (fatos de memória/categorização recente/streak/trial — muda no máximo algumas
   vezes por dia) e `volatile` (só a hora, nunca cacheado, sempre por último) — com 2
   `cache_control` próprios (+ 1 já existente nas tools = 3 de 4 breakpoints permitidos por
   request). `buildSystemPrompt` (string única) continua existindo como wrapper pros testes e pro
   provider OpenAI (que cacheia prefixo automaticamente no servidor, sem marcação explícita).
2. **Log de `usage`/cache** (`providers/types.ts`, `orchestration.ts`) — antes só `latencyMs` era
   logado; agora `llm_call_completed` também loga `inputTokens`/`outputTokens`/
   `cacheReadInputTokens`/`cacheCreationInputTokens` (Anthropic devolve os 4; a Chat Completions da
   OpenAI só devolve input/output, sem detalhe de cache) — é o jeito de provar, com o tempo, se a
   sugestão 1 está de fato reaproveitando cache entre mensagens.
3. **`effort: "low"` explícito no Haiku 5.5** (`anthropic-provider.ts`, `output_config`) — default
   do modelo é `medium`; conversa curta de WhatsApp com poucas tool calls por turno é o perfil que
   tende a ir bem com `low` (chat/triagem, não coding/raciocínio longo). **Não validado contra um
   eval** (não existe um neste projeto ainda) — monitorar qualidade de resposta real depois do
   deploy (triagem errada entre ferramenta parecida, confirmação confusa) e reverter pra `medium`
   se piorar.
4. **Few-shot de categorização movido pra camada semi-estável** — consequência direta do item 1:
   `formatRecentCategorizationsBlock` já estava cacheável, só não tinha onde (agora cabe no bloco
   `semiStable`).
5. **Schema de tools monitorado, não alterado ainda** — medição feita nesta rodada: 41 tools
   registradas (`tool-registry.ts`), ~18KB de JSON Schema serializado, ~4.500 tokens estimados
   (chars/4) — abaixo do patamar (~10K tokens) onde `tool_search`/`defer_loading` compensaria o
   próprio custo da busca. Watch item: remedir quando crescer mais (o número já quase dobrou numa
   única rodada de merge em paralelo — ver nota de duplicação de esforço abaixo).
6. **Correções de estilo de mensagem** (bugs reais, reportados em produção):
   - Quebra de linha: a instrução original dependia de um exemplo com `\n` embutido no meio de um
     prompt que já é inteiro quebrado em linhas por formatação de código-fonte — o modelo não tinha
     como distinguir "esta quebra é a instrução" de "isto é só como o arquivo está formatado".
     Reescrita pra ser explícita ("isto é sobre o TEXTO QUE VOCÊ MANDA, não sobre como este prompt
     está escrito aqui") com contraste ERRADO/CERTO.
   - Emoji único repetido: só havia um emoji de exemplo (🛒) na seção "Voz do Tom", e o modelo
     parecia ancorar nele pra qualquer assunto. Adicionada instrução explícita de variar por
     contexto + exemplos com 4 emojis diferentes (🛒 ✅ 📊 🎉), reforçando "nunca o mesmo emoji toda
     vez independente do assunto".

**Achado não relacionado às 5 sugestões, mas descoberto no processo**: outra sessão trabalhou em
paralelo nesta mesma janela de tempo e já deu merge direto em `main` (commits `a946a03`/`a3c5430`)
— datas importantes/metas pessoais duplicadas em parte, reconciliado pela própria sessão (migration
renumerada pra `0019`, `personal_goals` convivendo com `goals`/metas de economia separadas) antes
do merge chegar aqui. Sincronizado (`git merge --ff-only`), typecheck/teste/build confirmados
limpos depois — nenhuma ação adicional necessária, só reforça a importância da convenção já
documentada acima ("checar branches e PRs abertos antes de trabalho grande").

## Métricas por fase

- MVP: % usuários com ≥1 mensagem/dia na semana 1; tempo até 1ª ação concluída
- Fase 2: retenção D30; % contas bancárias conectadas; NPS
- Fase 3: ARPU; conversão trial→pago; CAC via indicação vs. pago

## Convenções de projeto

- Sem alternativas de stack em PRs — decisões acima são definitivas até que haja motivo documentado para mudar
- Nenhuma feature de Fase 2/3 entra em código antes do MVP validar retenção básica
- Toda integração financeira passa por camada de abstração própria (nunca acoplar direto ao provedor de Open Finance)
- Antes de iniciar trabalho grande (não uma correção pontual), checar branches e PRs abertos no repo — sessões/agentes diferentes já duplicaram esforço (ex.: múltiplas branches implementando a mesma rodada de melhorias em paralelo) por falta dessa checagem

## Fluxo de branches (2026-10, motivo documentado)

`main` é o único ponto de integração entre sessões — produção (Vercel) e
branch padrão do GitHub apontam pra ela. Motivo original: antes disso, cada
sessão criava sua própria branch (`ccr-*`/auto-gerada) sem saber das outras,
e pelo menos duas sessões refizeram o mesmo trabalho em paralelo (o fallback
multi-provider do LLM foi implementado duas vezes de forma independente
antes de alguém perceber).

**Amendamento 2026-10 (motivo documentado):** a etapa intermediária de
"branch de sessão + merge de volta" foi abandonada — mesmo com a regra
acima, sessões continuaram divergindo de `main` e acumulando branches que
precisavam ser reconciliadas manualmente (ex.: `claude/trusting-meitner-eipvnk`
recebeu commits direto, sem passar por `main`, forçando merge retroativo).
Commit novo vai **direto pra `main`**, sem branch própria:

1. Garantir `main` local atualizada antes de começar (`git fetch origin main && git checkout main && git merge --ff-only origin/main`).
2. Trabalhar e commitar direto em `main`.
3. Validar (typecheck/test/build) antes de dar push.
4. `git push origin main`. Se alguém empurrou antes, `git pull --rebase` (ou merge) e revalidar antes de tentar de novo — nunca force-push em `main`.

Branch de sessão só se justifica pra trabalho experimental/grande demais pra
validar de uma vez — e aí ela é mesclada em `main` e apagada no mesmo dia,
nunca deixada pra trás.
