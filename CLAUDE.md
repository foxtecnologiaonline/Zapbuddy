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

- **Resumo matinal** (fila `morning-digest-generate`, 8h local): agora em **3 mensagens separadas** (2026-10,
  amendamento, motivo documentado — pedido do dono do produto):
  1. Narrativa (dia da semana, data, estação do ano, previsão do tempo e feriado nacional/estadual de hoje, se
     houver) — escrita como frase corrida, não lista de bullet, e **sempre enviada** (diferente das duas seguintes,
     que só saem se houver algo). Estação do ano assume hemisfério sul pro Brasil inteiro (mesma aproximação
     nacional de `timezone-from-ddd.ts`, mesmo nos estados mais próximos do Equador onde a variação é pequena).
     Previsão do tempo via **OpenWeatherMap** (`OPENWEATHERMAP_API_KEY`, endpoint gratuito "5 day/3h forecast", sem
     cartão) — escolhido em vez do Open-Meteo porque o Open-Meteo proíbe uso comercial no tier sem chave, e o
     ZapBuddy é pago. Opcional: sem a chave, ou se a busca falhar, a narrativa sai sem a frase de clima — nunca com
     dado inventado. Localização (cidade/UF/coordenadas) é inferida do DDD do WhatsApp
     (`location-from-ddd.ts`, packages/db) — mesma mecânica/aproximação de `inferTimezoneFromWhatsappNumber`, só
     que cobrindo todos os DDDs (não só as 8 exceções de fuso), porque aqui o erro afeta temperatura e feriado
     estadual, não só fuso. Feriado estadual é tabela de melhor esforço (`digest/holidays.ts`, packages/core):
     cobre 21 das 27 UFs com uma data confirmada em pesquisa; AC, MT e PR ficam de fora de propósito (fonte
     divergente ou nenhum feriado estadual vigente encontrado) — mesmo princípio de nunca inventar dado, estendido
     aqui a fato.
  2. Agenda do dia (Google Agenda, se conectada) + tarefas com entrega **hoje** — tarefa atrasada não entra mais
     aqui (decisão explícita do dono do produto nesta rodada: resumo matinal narrativo foca no dia, não cobra
     atraso). Só enviada se houver algo.
  3. Contas recorrentes que vencem **hoje** (não mais a janela de até 3 dias de antes — decisão explícita desta
     rodada: "compromissos financeiros do dia"). Só enviada se houver alguma.
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
  - **Amendamento 2026-10 (motivo documentado, incidente recorrente):** o banco novo também
    estourou a cota mensal do plano Fixed (500.000 requests), causando falha intermitente de
    processamento de mensagem (`webhook_message_failed`, "max requests limit exceeded") — Tom
    parava de responder pra uma fração das mensagens, de forma aleatória. **Diagnóstico: causa
    raiz diferente da de 2026-10 acima** — `stalledInterval`/heartbeat (já esticados pra 1h/2h)
    seguem responsáveis por um volume hoje desprezível (~336 comandos/dia mesmo com 14 filas, vs.
    os ~30 mil/dia do incidente original); o consumo atual é dominado por **tráfego real de
    mensagem**, que cresceu desde a correção original. Dois cortes de código aplicados nesta
    rodada (sem mudar arquitetura nem resolver o estouro por si só, só reduzem o piso):
    `appendTurns` (`context/conversation-context.ts`) agora grava os dois turnos de uma mensagem
    (pessoa + Tom) num único round-trip em vez de dois separados — essa chamada roda em TODA
    mensagem, então era o maior "dobrador" de comando evitável; e o card de status do admin
    (`admin/status/page.tsx`) parou de chamar `getWorkerHeartbeatAgeMs()` duas vezes (uma direta,
    uma dentro do extinto `isWorkerHealthy()` — agora `isHeartbeatFresh(ageMs)`, puro). Correção
    de fato pro estouro de cota é decisão de plano/provedor (Upstash pay-as-you-go, outro
    provedor, ou auto-upgrade), não cabe em código — decisão do dono do produto, não tomada por
    uma sessão sozinha.
  - **Amendamento 2026-10 (motivo documentado, correção de diagnóstico + redução de ~80-90%):**
    o dono do produto mandou o próprio dashboard da Upstash — corrige o amendamento acima:
    **não é tráfego real de mensagem crescendo**, é overhead estrutural do BullMQ. O banco está em
    **Eco Mode** (modo de billing legado feito pra BullMQ/Bull/Sidekiq, sendo descontinuado pela
    Upstash — banner no próprio dashboard recomenda migrar pra Fixed Plan) e o gráfico de
    "Top Commands Usage" mostra `BZPOPMIN`/`ZPOPMIN`/`ZRANGE` dominando, num platô constante de
    ~20 comandos/s — assinatura de poll de infraestrutura, não de conversa humana. Causa raiz real
    (lida no código-fonte do BullMQ, `node_modules/bullmq/dist/esm/classes/worker.js`,
    `getBlockTimeout`): toda fila com QUALQUER job atrasado/repetível pendente é travada pelo
    próprio BullMQ num teto de bloqueio de 10s (`drainDelay` não se aplica nesse caso — só quando
    não há nenhum delay pendente) — então qualquer fila com `repeat` do BullMQ fica reconectando a
    cada ≤10s **24/7**, mesmo que o job em si rode 1x por semana. Isso afetava 3 filas de
    manutenção semanal (`proactive-research`/`interpretation-feedback`/`logs-retention`, cada uma
    com seu `repeat` próprio em `scheduled-jobs.ts`) sem nenhum ganho — rodavam 1x/semana mas
    pagavam o custo de poll o ano inteiro. Corrigido:
    - As três agora rodam direto de dentro do sweep horário já existente
      (`insights-sweep.ts` → `runWeeklyMaintenance()`), gated por dia/hora UTC — mesmo
      `repeat: '0 9/10/11 * * 1'` de antes, sem fila/Worker dedicado. `scheduled-jobs.ts` foi
      apagado (ficou vazio). Elimina 3 dos 14 Workers (e suas 3 conexões bloqueantes 24/7) por
      inteiro.
    - `drainDelay` (`apps/worker/src/worker.ts`, default do BullMQ é 5s) subido pra 55s em todos
      os Workers restantes — só tem efeito nas filas SEM job atrasado pendente (a maioria), nunca
      atrasa pickup de job real (`Queue.add()` acorda o Worker bloqueado na hora via a chave
      "marker", independente do valor de `drainDelay` — confirmado lendo
      `addJobInTargetList.lua`). `reminder-dispatch`/`onboarding-nudge`/`insights-sweep` continuam
      presas no teto de 10s do BullMQ sempre que têm job atrasado pendente (quase sempre) — isso
      não é resolvível por opção de configuração; só trocando a precisão do lembrete/nudge por uma
      varredura mais grossa, decisão de produto que não foi tomada aqui.
    Não resolve a cota do Eco Mode já estourada neste ciclo (isso continua sendo a troca de plano
    já pedida ao dono do produto) — reduz o consumo estrutural pra frente, pra não estourar de
    novo assim que o plano for trocado.
  - **Amendamento 2026-10 (motivo documentado, pedido explícito "aumentar todos os tetos de 10s
    pra 1h"):** `drainDelay` subido de 55s pra 1h (`apps/worker/src/worker.ts`) — só afeta filas
    sem job atrasado pendente, segue não atrasando job real (mesmo mecanismo de marker). O teto de
    10s em si (`maximumBlockTimeout`, hardcoded dentro do `node_modules/bullmq`, não uma opção de
    `WorkerOptions`) **não foi alterado** — perguntado ao dono do produto como proceder com as 3
    filas ainda presas nele (`reminder-dispatch`/`onboarding-nudge`/`insights-sweep`), já que
    patchar a lib de terceiro reintroduziria o mesmo risco de "Tom não responde" que motivou essa
    investigação (Worker bloqueado até 1h sem perceber que a conexão caiu). Decisão: **só
    `onboarding-nudge` foi convertida** pra rodar dentro do sweep horário (mesmo padrão dos 3 jobs
    semanais acima) — `listUsersPendingOnboardingNudge` (`packages/db/src/repositories/users.ts`)
    substitui o delay nativo do BullMQ por usuário (2h/24h exatos) por uma checagem de janela
    horária `[from, to)` sobre `users.created_at`/`onboarding_completed_at IS NULL`, chamada em
    toda passada do sweep. Precisão vira "dentro da hora" em vez de no minuto exato — aceito
    explicitamente, nudge é reengajamento best-effort, não uma promessa de horário como lembrete.
    `reminder-dispatch` e `insights-sweep` continuam com delay/repeat nativo do BullMQ, presas no
    teto de 10s sempre que têm algo pendente (quase sempre) — decisão explícita de manter a
    precisão exata do lembrete e aceitar esse piso de consumo nessas duas, já bem menor (2 filas,
    não 14) que o estado original.
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

**Amendamento 2026-10 (motivo documentado, pedido explícito do dono do produto):** "Google Agenda"
generalizada pra suportar **Outlook/Microsoft 365** também — a integração deixou de ser
Google-específica. `packages/core/src/google/` virou `packages/core/src/calendar/` (`types.ts`
genéricos; `providers/google.ts` e `providers/microsoft.ts`, cada um fazendo OAuth + chamada de
API via fetch direto, sem SDK, mesmo padrão de antes; `calendar-access.ts` despacha pro provider
certo da conta — tools/`undo_last_action`/resumo matinal só chamam essas funções genéricas, nunca
um provider específico). Migration `0022_calendar_multi_provider.sql` adiciona
`calendar_connections.provider` e renomeia as colunas (`google_refresh_token_encrypted` →
`refresh_token_encrypted`, `google_calendar_id` → `calendar_id`).

Decisões explícitas (perguntadas ao dono do produto antes de implementar):
- **Uma agenda conectada por conta, nunca as duas juntas** — conectar o Outlook com o Google já
  conectado substitui a conexão (mesmo upsert por `account_id` que já existia, só precisava
  aceitar `provider`). Evita a complexidade de decidir em qual calendário criar um evento, ou de
  checar conflito em dois calendários ao mesmo tempo.
- **Rotas do Google (`/api/calendar/connect`, `/api/calendar/callback`) não foram movidas** —
  mexer nelas quebraria o redirect URI já registrado no Google Cloud Console em produção. O
  Outlook ganhou rotas próprias (`/api/calendar/microsoft/connect`, `.../callback`).
- **Credencial do Azure AD ainda não existe** — implementado mesmo assim, mesmo padrão já usado
  pro Asaas/Tavily: sem `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_REDIRECT_URI`
  preenchidos, o botão "Conectar Outlook" falha de forma controlada (`?calendar=error`), nunca
  afeta o Google. Passo a passo de criação do app no Azure Portal documentado no `.env.example`.
- **Nenhuma outra integração entrou nesta rodada** — Apple/iCloud Calendar foi avaliado e
  descartado: sem OAuth de consumidor de verdade (só CalDAV + senha de app específica do iCloud),
  fricção e risco de segurança altos pra pouco ganho. Open Finance/banco continua explicitamente
  fora de escopo (decisão anterior, não revisitada).

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

- **Amendamento 2026-10 (motivo documentado — reversão explícita da decisão original abaixo):**
  preço fechado em **R$ 27,90/mês**, provedor **Asaas**. `register_plan_intent(intent: "upgrade")`
  gera checkout real (PIX/boleto/cartão na página hospedada pela Asaas — nunca entra no nosso
  código), ativado automaticamente via webhook (`apps/web/app/api/payments/webhook-asaas`) quando
  o pagamento confirma. Exige CPF/CNPJ só na hora de fechar (exigência da Asaas, migration `0020`).
  `ASAAS_ENV=sandbox` por padrão — só cobra de verdade com `production` setado explicitamente.
  Cancelamento continua manual (`intent: "cancel"` só avisa um humano) — decisão explícita de não
  automatizar isso agora. Detalhe completo: amendamento no fim de
  `docs/adr/0004-vendas-onboarding-indicacao.md`.
- ~~Sem preço fechado e sem cobrança real~~ (decisão original, revertida pelo amendamento acima —
  mantida aqui só pra contexto histórico): nenhum provedor de pagamento decidido. O Tom capturava
  intenção via tool `register_plan_intent`, nunca cobrava nem cancelava nada sozinho; um humano
  tratava manualmente pelo admin (mesmo padrão já usado por `plan_status`).
- ~~**Trial de 7 dias**, calculado a partir de `users.created_at` — sem convite de venda antes do
  5º dia, "prepara o terreno" entre o 5º e o 7º, convite direto a partir do 7º (só pra quem
  continua em `plan_status = 'trial'`).~~ (decisão original, revertida pelo amendamento no fim
  desta seção: trial virou 3 dias, com bloqueio real — não só convite — a partir do fim do trial.)
- **Straight Line System (Jordan Belfort) adaptado, não copiado**: aproveita certeza construída em
  fato real + convite único + loop de objeção limitado a uma volta; descarta de propósito urgência
  fabricada, prova social inventada e insistência além da segunda recusa — isso violaria a regra
  de nunca inventar dado/contexto e o tom de "parceiro caloroso" já fixado.
- **Indicação proativa, sem recompensa concreta** — decisão explícita de deixar a recompensa pra
  decidir depois; o Tom pode sugerir indicar alguém num momento positivo da conversa, mas nunca
  promete prêmio/desconto que não existe.
- **Cancelamento**: uma tentativa de retenção genuína, nunca duas — simetria com a regra do
  convite de venda.

**Amendamento 2026-10 (motivo documentado — reversão explícita do "nunca bloqueia" da decisão 1
original do ADR 0004):** trial vira **3 dias** (era 7) e passa a ter **bloqueio real** de uso —
pedido explícito do dono do produto. Diferente de antes (onde `plan_status = 'trial'` nunca
impedia nada, só mudava o texto que o Tom mandava), agora `users.trial_ends_at` (migration `0023`)
marca o fim do trial e, passado isso sem `plan_status = 'active'`, a mensagem da pessoa **nem chega
a rodar o LLM** — `orchestrateTurn` intercepta antes (`packages/core/src/payments/trial-gate.ts`).
`plan_status = 'canceled'` também bloqueia (não tinha sentido deixar de fora). O que acontece:
- **Mensagem fixa, repetida em toda mensagem enquanto bloqueado** (decisão explícita — mais
  insistente que o convite único do ADR 0004 original, porque aqui é bloqueio de verdade, não
  convite): pede CPF/CNPJ pra gerar o link de pagamento. Única "porta" que passa pelo bloqueio é
  uma mensagem que seja só um CPF/CNPJ plausível (nunca gerada pela IA — ver `messages.ts`).
- **Dashboard web continua acessível** mesmo bloqueado (decisão explícita) — só o WhatsApp
  trava; a pessoa não perde acesso aos próprios dados já registrados por falta de pagamento.
- **Quem já estava em trial quando a migration `0023` rodou ganhou 3 dias novos a partir daquele
  momento** (não do `created_at` original) — decisão explícita do dono do produto, pra não travar
  ninguém de surpresa sob a regra antiga. O default da coluna é volátil (`now() + interval '3
  days'`) de propósito: reavalia pra cada linha já existente no momento da migration E pra cada
  INSERT novo depois — mesmo efeito, sem precisar de coluna calculada nem lógica em `createUser()`.
- **Lógica de checkout extraída** pra `packages/core/src/payments/upgrade-flow.ts`
  (`generateUpgradeCheckout`) — reaproveitada pela tool `register_plan_intent` (pessoa topa durante
  uma conversa normal, ainda dentro do trial) e pelo bloqueio (pessoa só consegue mandar CPF/CNPJ).
  Mesma regra de negócio, dois pontos de entrada — nunca duplicada.
- `system-prompt.ts` (`buildUpgradeSection`) perdeu o branch de "convite direto" forçado depois do
  trial — ficou inalcançável (quem chega lá sempre ainda está dentro do trial, já que o bloqueio
  intercepta antes do LLM pra quem já passou). Sobrou só um aviso suave no último dia + a
  disposição de seguir o fluxo de assinatura se a PRÓPRIA pessoa trouxer o assunto antes do
  bloqueio agir — o convite único/loop de objeção limitado do ADR 0004 original continua valendo
  nesse caso oportunista, só não é mais forçado pelo Tom por conta própria.

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
  **Amendamento 2026-10 (motivo documentado, decisão do dono do produto): este teste A/B foi
  encerrado antes de ter amostra** — a abertura do onboarding virou um script fixo em 3 frases
  (ver seção "Cadastro progressivo" abaixo): 1) o Tom se apresenta, 2) avisa que o teste grátis
  começa hoje e vale 3 dias (adicionada com o trial de 3 dias; a mensagem de bloqueio no fim do
  trial é fixa e **não cita preço** — decisão do dono do produto, o valor aparece na página da
  Asaas), 3) pergunta nome E e-mail juntos, numa frase só (`buildOnboardingSection`, sem mais
  ramificação por `onboarding_variant`).
  A coluna `onboarding_variant` e a atribuição determinística continuam existindo (não apagadas) só
  pra manter o dado histórico do funil do admin legível — a partir desta decisão ela não influencia
  mais o texto que o Tom manda, então os números das duas variantes devem convergir pra frente.

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

## Cadastro progressivo e link direto pro WhatsApp (2026-10, motivo documentado)

Decisão do usuário: (1) um link `wa.me` pronto, com "Oi Tom!" pré-preenchido, pra quem acessa cair
direto na conversa — sem digitar nada; (2) ao longo dos 7 dias de teste, o Tom vai perguntando os
campos de cadastro que ainda faltam, sem formulário e sem interrogatório, só quando a conversa
abrir espaço natural pra isso. Campos cobertos (`migration 0021_cadastro_progressivo.sql`):

- **Ocupação** (já existia desde o onboarding, capturada só se mencionada) — ganhou
  `update_occupation`, pra quando só vem à tona depois do primeiro dia.
- **Horário de silêncio** — `users.quiet_hours_confirmed_at` marca que a pessoa de fato confirmou
  via `set_quiet_hours` (diferente de `quiet_hours_start/end`, que sempre têm um valor default
  22/7 mesmo sem confirmação nenhuma) — sem essa coluna não dava pra saber se "ainda falta
  perguntar" ou se o default já é o que ela queria.
- **E-mail** — nova tool `set_email`. **Amendamento 2026-10 (motivo documentado, decisão do dono
  do produto): e-mail passou a ser pedido já na abertura do onboarding**, junto do nome, na mesma
  frase (ver amendamento da seção "Onboarding turbinado" acima) — não é mais exclusivamente
  cadastro progressivo dos dias seguintes. `buildProgressiveSignupSection` continua cobrindo e-mail
  como rede de segurança: se a pessoa não informar no onboarding, o Tom pode perguntar de novo,
  no máximo uma vez por conversa, nos dias seguintes — nunca interrompe nem repete à toa.
- **CPF/CNPJ** — já existia (migration 0020), continua pedido só no momento de fechar a assinatura
  (`buildUpgradeSection`), nunca nos primeiros dias.
- **Número de WhatsApp** — não entra no cadastro progressivo: já é capturado automaticamente na
  primeira mensagem (`users.whatsapp_number`); pedir de novo seria redundante.
- **Forma de pagamento** (`users.preferred_payment_method`, PIX/boleto/cartão) — **amendamento
  dentro desta mesma decisão**: não é perguntada em conversa. A Asaas só informa o meio
  (`billingType`) depois que um pagamento de verdade confirma — por isso é salva automaticamente
  no webhook (`apps/web/app/api/payments/webhook-asaas/route.ts`, evento `PAYMENT_CONFIRMED`/
  `PAYMENT_RECEIVED`), nunca pelo Tom perguntando antes. Continua sendo só a categoria declarada
  pela própria Asaas (nunca número de cartão/chave PIX, que a Asaas nunca manda pra nós).

Regra geral da seção nova no system prompt (`buildProgressiveSignupSection`): no máximo um campo
pendente perguntado por conversa, só nos primeiros 7 dias (`daysSince(created_at) <= 7`), nunca
interrompendo o que a pessoa pediu, nunca repetido se ela não responder.

**Link `wa.me`** (`packages/core/src/whatsapp/deep-link.ts`, env nova `TOM_WHATSAPP_NUMBER` —
diferente de `WHATSAPP_PHONE_NUMBER_ID`, que é o identificador opaco da Cloud API, não o número de
telefone real): `buildWhatsappDeepLink` monta o link genérico ("Oi Tom!"); aproveitado também pelo
fluxo de indicação já existente (`get_referral_info`/`buildReferralWhatsappDeepLink`) — a pessoa
indicada agora pode clicar num link com "Indicado <código>" já preenchido em vez de digitar isso
manualmente. Sem `TOM_WHATSAPP_NUMBER` configurada, a tool e o painel caem de volta pro código
manual — nunca um link quebrado.

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
