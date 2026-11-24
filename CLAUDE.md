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

- **Resumo matinal** (fila `morning-digest-generate`, hora local configurável por pessoa, default 8h): agora em **3 mensagens separadas** (2026-10,
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
  **Refinamento (2026-10, pedido do dono do produto, 10 melhorias — migration `0024_morning_digest_prefs.sql`
  precisa ser aplicada no Supabase ANTES do deploy: o sweep horário passou a selecionar colunas novas de `users`):**
  - Montagem das mensagens separada do IO: `composeMorningDigest` (`digest/morning.ts`, puro e testado); o handler só
    busca (tudo em `Promise.all`, cada fonte com fallback próprio) e envia, com pausa de 1,5s entre as mensagens
    (ordem 1-2-3 garantida). Se agenda+tarefas e financeiro somam até 2 itens, viram uma mensagem só.
  - Saudação com nome (`preferred_name` ou primeiro nome) e bom dia/boa tarde/boa noite pela hora; abertura varia por
    dia da semana, de forma determinística (mesmo dia → mesma frase, retry não muda o texto). Sem LLM — template, como
    nos insights (ADR 0003). Dicas práticas do clima (`digest/weather-tips.ts`: guarda-chuva, casaco, protetor) e
    emoji pela condição; formatação do WhatsApp (`*negrito*`), próximo compromisso destacado, hora nas tarefas
    quando for uma hora de verdade, CTA no fim de cada mensagem, linha de "dia livre" só quando agenda e financeiro
    estão ligados e vazios **e todas as buscas deram certo** (se agenda/tarefas/contas falharam, "vazio" não é "livre" e a
    frase não aparece — nunca afirma "agenda livre" sem saber).
  - Clima: cache em **memória do worker** (não Redis — a cota do Upstash já estourou por comando), chave = coordenada
    arredondada + dia local, com dedupe de pedidos simultâneos e cache negativo de 5 min; uma chamada por lugar em vez
    de uma por usuário. Corrigido junto: a detecção de chuva usava faixas da escala WMO (Open-Meteo) em vez dos IDs do
    OpenWeatherMap (2xx/3xx/5xx), então só `pop >= 0.4` detectava chuva.
  - Tarefas de hoje filtradas no banco (`listPendingTasksDueBetween`): `listTasks` corta em 50 por criação, e numa
    conta com muitas pendentes uma tarefa de hoje podia ficar de fora.
  - Cidade real: tool `set_city` (geocoding do OpenWeatherMap, mesma chave) guarda cidade/UF/coordenadas e passa a
    valer no lugar da aproximação pelo DDD (clima + UF do feriado estadual); entra no cadastro progressivo.
    **Feriado municipal NÃO foi implementado**: a pesquisa não achou fonte confiável (datas divergentes entre fontes,
    ex.: aniversário vs. padroeiro) — mesmo princípio de não informar data errada. Só municipal confirmado entraria.
  - Preferências da pessoa via `set_morning_digest_preferences`: ligar/desligar, horário local (0-23) e se inclui
    agenda/tarefas e financeiro. Horário dentro do silêncio é recusado na hora (a mensagem nunca sairia).
  - Log `morning_digest_sent` por envio (partes presentes, se havia clima/feriado, se a cidade era conhecida) para
    medir quanto o clima falha e quais seções as pessoas realmente recebem.
  - **Pergunta de conclusão de tarefa atrasada** (2026-10, reportado pelo usuário em produção; `tasks.follow_up_asked_at`,
    migration `0022_task_follow_up.sql`): como o resumo só lista tarefas de HOJE, uma tarefa que passou do prazo e
    ficou pendente sumia sem o Tom nunca perguntar se aconteceu. Agora o resumo manda, depois das outras mensagens,
    uma extra "❓ Preciso confirmar com você" com as tarefas pendentes de dia anterior ainda não perguntadas (as 5
    mais recentes por dia; o resto fica pros dias seguintes), oferecendo concluir OU remarcar. Marca como
    perguntada só DEPOIS de entregue (se falhar, tenta no dia seguinte) e nunca repete a pergunta pela mesma tarefa.
    Remarcar (`update_task` com `due_at` novo) zera a marca: a data nova volta a valer. A resposta segue o fluxo
    normal (`list_tasks` + `complete_task`/`update_task`/`delete_task`). Existem dois arquivos com prefixo `0022`
    (`0022_calendar_multi_provider.sql` e `0022_task_follow_up.sql`) — são independentes e idempotentes.
  - **Mais informação no bom dia** (2026-10, pedido do dono do produto; sem migration): emojis pelo contexto (cabeçalho
    pela hora do dia — a flor 🌸 só aparece no corpo, junto da frase da primavera, nunca no início) e 5 informações
    úteis, todas só com dado que a pessoa registrou (`digest/extras.ts`, puro; `handlers/morning-digest-extras.ts`,
    IO com `safely` por fonte): (1) contagem regressiva do próximo compromisso logo abaixo da lista de agenda;
    (2) datas importantes de hoje + próximos 3 dias — a de HOJE já avisada no ano não repete, e ao entregar o resumo ela é
    marcada em `important_date_logs` pro aviso separado das 9h não duplicar (se a mensagem falhar, não marca);
    (3) retrato financeiro leve — gasto de ontem (omitido se zero: costuma ser "não registrei"), mês até ontem
    comparado ao mesmo trecho do mês passado (só com os dois trechos > 0) e categorias com limite próprio
    (`set_budget_alert`) a partir de 80%; sem julgamento; (4) hábitos (sequência, falta marcar hoje) e metas COM valor
    cujo prazo declarado está a ≤14 dias — meta qualitativa não tem prazo e não entra; (5) prévia de amanhã
    (compromissos, tarefas e previsão de amanhã, tirada da MESMA resposta do OpenWeatherMap, sem chamada extra).
    Vão numa mensagem própria, depois de agenda/financeiro e antes da pergunta de tarefa atrasada; a narrativa passa a
    anunciá-la ("separei umas informações úteis pra você 👇"). Sem nova preferência: datas, hábitos/metas e amanhã
    seguem o toggle de agenda/tarefas e o retrato financeiro segue o de financeiro
    (`set_morning_digest_preferences`). Cotações (dólar/Selic) ficaram de fora — alternativa à prévia de amanhã,
    não implementada. Não validado com usuários reais: observar se a mensagem de extras ficou longa.
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

## Estado vigente e precedência (2026-11, consolidação — leia antes das emendas abaixo)

Este arquivo cresceu por emendas empilhadas, e algumas se contradizem no texto histórico. Regra de
leitura: **a emenda mais nova prevalece; na dúvida, vale o código e os ADRs (`docs/adr/`).** O que está
vigente hoje:

- **Fase**: MVP + Fase 2 (sem Open Finance) + Fase 3 (sem cobrança a terceiros/nota fiscal) + expansão B2C
  estão implementados. O trabalho agora é endurecimento, validação com usuário real e decisões de plano
  (Redis) e de cobrança — não features novas de roadmap.
- **Painel e cobrança**: desligados por padrão (`DASHBOARD_ENABLED`/`BILLING_ENABLED`, ADR 0008). Onde as
  seções de vendas/trial/onboarding abaixo falam de painel, preço, teste de 7 ou 3 dias, bloqueio e checkout,
  isso descreve o código **quando as flags estão ligadas**. Trial vigente (se religado): **3 dias**, nunca 7.
- **Onboarding**: abertura = apresentação + só o NOME (ADR 0008). O roteiro de "3 frases com nome e e-mail" e o
  teste A/B de abertura citados abaixo estão superados.
- **Emoji**: no máximo 1 por LINHA (não por mensagem).
- **Entrada pública**: `/` é a landing (`docs/adr/0010-landing-page.md`), com texto em função das flags.
- **Branch/fluxo**: o fluxo "commit direto em `main`" abaixo vale para sessões sem branch designada; uma sessão
  com branch própria designada pelo ambiente (`claude/*`) trabalha nela e só integra em `main` por pedido.
- **Migrations**: ordem completa no README. Duas têm prefixo `0022` (independentes). A `0031`
  (`proactive_opt_out`) é a mais recente e a ÚNICA que o código tolera não aplicada (veja a seção "Novas interações" abaixo). Aplicar no Supabase **antes** do deploy do código que a usa
  (o worker faz deploy automático em push na `main`).

- **Deploy do web (Vercel)**: a *Production Branch* do projeto `zapbuddy` era `claude/trusting-meitner-eipvnk` (descoberto em
  2026-11-21: os deploys da `main` saíam como preview e o web em produção ficou atrás do worker) e foi trocada para **`main`**
  pelo dono do produto no mesmo dia. Hoje **push em `main` atualiza worker (GitHub Actions → VPS) e web (Vercel, produção)**.
  O `ignoreCommand` (`apps/web/vercel.json`) compara com o último deploy da MESMA branch e antes descartava até o deploy de
  produção do mesmo commit; agora nunca pula build quando `VERCEL_ENV=production` (só pula preview sem mudança em
  `apps/web`/`packages`). Um redeploy manual de produção do mesmo commit continua possível via `target: production`.

**Segurança (2026-11, integrado da branch `ccr-3430b98a-uhjeh9`)**: webhooks de saída com guarda anti-SSRF
(`packages/core/src/security/ssrf-guard.ts`: valida a URL no cadastro; na entrega o IP é validado **e fixado no
instante da conexão** — `publicOnlyLookup` passado como `lookup` do `https.request` em `webhooks/safe-post.ts`, sem 2ª
resolução de DNS, então não há janela de DNS rebinding —; faixas bloqueadas por CIDR com `net.BlockList`, incluindo
IPv6 que embute IPv4 (NAT64, 6to4, Teredo, IPv4-compatível, SIIT), site-local, CGNAT e metadata de cloud; não segue
redirect e não retenta bloqueio); open redirect do admin corrigido; headers HTTP de segurança e `no-store`
em dashboard/admin; JSON inválido nos webhooks vira 400; nome de arquivo do remetente sanitizado na chave do
Storage. Dependências: `next` 15.5.29 (zera o crítico de execução remota via imagem SVG) e override global do
`postcss` (>= 8.5.23).
**Risco aceito, com motivo:** `npm audit` ainda lista `zod` (alto, memória em coleção enorme; correção exige a major
4) e um `next` moderado (correção só no Next 16, major). `zod` só valida argumentos de tool gerados pelo LLM — nada
do `apps/web` nem payload externo — e a migração toca ~20 tools e o gerador de JSON Schema (`zod-to-json-schema`,
só v3), com o orçamento de tokens das tools sob teste. Reavaliar ao subir o Next para 16. O CI bloqueia só em nível
crítico (`npm audit --omit=dev --audit-level=critical`).

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

## Painel e cobrança inibidos; onboarding reescrito (2026-10, ordem do dono do produto — "até próxima ordem")

Detalhe em `docs/adr/0008-onboarding-sem-painel-e-sem-cobranca.md`. **Isto sobrepõe o que as seções de vendas,
trial e onboarding abaixo dizem sobre painel, teste de 3 dias, bloqueio e checkout enquanto os interruptores
estiverem desligados** (e eles estão desligados por padrão — nada a configurar):

- `DASHBOARD_ENABLED` / `BILLING_ENABLED` (`packages/core/src/features.ts`), só `true` liga. Desligado, o Tom não
  oferece painel/link/exportação, ninguém é bloqueado por trial, e preço/plano/assinatura viram "por enquanto o
  Tom está liberado, sem cobrança". O site mostra "painel indisponível" (`apps/web/middleware.ts`).
- Conectar agenda (OAuth) depende do painel — novas conexões ficam indisponíveis; o Tom sugere salvar o
  compromisso como tarefa com data e hora.
- **Onboarding**: abertura = apresentação + o que faz + só o NOME (e-mail saiu da abertura, volta no cadastro
  progressivo); pedido na primeira mensagem é atendido antes de pedir o nome; boas-vindas com 4 exemplos
  concretos; primeira ação do 1º dia convida ao resumo matinal pedindo a cidade. Sobrepõe o roteiro de 3 frases
  do amendamento de onboarding abaixo.
- **Regra de emoji mudou** (pedido do dono do produto): **no máximo 1 emoji por LINHA** (antes: 1 por mensagem). Vale
  pro prompt do Tom e pras mensagens automáticas (resumo da manhã etc., com teste que garante); mensagem de várias
  linhas pode ter um emoji em cada linha, nunca dois na mesma.

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

## Comunicação do Tom — personalidade, humor e repertório (2026-10, motivo documentado)

Pedido do dono do produto: rever e expandir conhecimento, argumentos, respostas, interações, humor e
contexto do Tom. Novo módulo `packages/core/src/llm/tom-persona.ts`, no bloco `stable` do system prompt
(cacheado; ~2.400 tokens a mais), só para quem já fez o onboarding — a abertura de 2 frases continua
script fixo. Resumo:

- **Piada só quando a pessoa pede** (decisão do dono do produto, corrige a primeira versão que tinha humor
  espontâneo): leveza no tom sim, tirada própria não. Quando pede, o Tom chama `tell_joke` — banco curado
  em `llm/jokes.ts` (37 piadas, 7 temas, sorteio sem repetir na conversa via `already_told_ids`). Piada
  improvisada pelo modelo é evitada de propósito (costuma ser fraca); nada sobre grupos de pessoas nem
  política. Critério pra entrar no banco: curta, graça na observação ou na virada, funciona sem explicar.
- **Honestidade sobre ser IA**: nunca se passa por humano, nem sob insistência.
- **Sofrimento sério**: tarefa e registro ficam de lado, acolhe e cita o CVV (188, gratuito, 24h).
  Sem diagnóstico, sem terapia.
- **Proatividade**: no máximo UMA sugestão por resposta, em forma de pergunta, nunca cria nada sem o "sim".
  Nunca promete "vou lembrar" sem registro pela tool.
- **Repertório de apoio**: educação financeira e gestão de tempo em 1-2 frases (reserva de emergência,
  50/30/20, cartão/parcelas, dívidas, priorização, passo mínimo). Número que muda com o tempo (juros,
  Selic, alíquota) o Tom NÃO cita de cabeça — `web_search`. Nunca recomenda produto, banco ou ativo, nunca
  promete rendimento, não é consultor financeiro.
- **Português do dia a dia**: abreviações, gíria de valor e períodos do dia ("de manhã" = 9h etc., dito na
  confirmação pra ela corrigir).
- **Mensagens automáticas** (fora do LLM): mais variações no lembrete, na abertura do resumo matinal e no
  reengajamento do onboarding. Template fixo continua sendo escolha deliberada (sem chamada ao LLM).

- **Lacunas de capacidade** (achadas ao listar 20 pedidos possíveis): resumo financeiro de `this_month`/`last_month`
  (`get_financial_summary`) é meu; agenda futura (`tomorrow`/`next_7_days`), `update_task` e `list_reminders`/
  `update_reminder` foram feitos em paralelo por outra sessão (seção "Alcance do Tom" abaixo) e prevalecem. "O que
  tenho amanhã" junta agenda e tarefas com `due_at` — compromisso salvo como tarefa (agenda desconectada) não pode
  ficar invisível. Lacuna que continua: adiar um lembrete que JÁ disparou (`update_reminder` só edita pendente; o
  Tom pergunta o que adiar e cria um novo).

Não validado contra eval real (não existe um neste projeto): monitorar nas conversas reais se a resposta
ficou longa e quais piadas o pessoal mais pede — o banco cresce/troca conforme o retorno.

## Conversa natural (2026-11, pedido do dono do produto: conhecimento e conteúdo pra conversar com naturalidade)

Guia pra acrescentar conteúdo: `docs/conteudo-conversacional.md`. **A regra não mudou: o Tom é uma IA e diz isso** — natural não é
fingir ser gente (não inventa rotina, família, gosto, fome nem sono; testes barram afirmação de vida humana). Entrou:
- `llm/conversation-knowledge.ts` (dados editáveis, bloco `stable`, ~1.500 tokens com teto de 8.000 caracteres no teste): princípios
  (espelhar tamanho e energia, variar a abertura, falar como WhatsApp, nada de linguagem de atendimento), 14 situações (conversa fiada,
  retribuir "e você?", cansaço, clima da data, boa e má notícia, risada/emoji soltos, desistência, mensagem longa, perguntas sobre o
  Tom), vocabulário brasileiro que ele entende e assuntos delicados (política, religião, futebol, saúde, relacionamento, ofensivo).
- `digest/calendar-dates.ts`: datas dos próximos 21 dias **calculadas por regra** (feriados nacionais pelo módulo existente, Páscoa,
  Dia das Mães/Pais, Namorados, Crianças, Black Friday = sexta depois da 4ª quinta de novembro, Réveillon) na camada **volátil**
  (some quando não há nada perto). O Tom menciona no máximo uma, em pergunta leve, nunca cria nada sem o "sim".
- O eval ganhou checagem de **texto** (`expect.text`): não soar como atendimento, não afirmar vida humana, citar o 188 no sofrimento
  sério, luto sem tarefa. Não validado contra o modelo real: rodar `npm run eval:golden` e observar nas conversas se ficou
  tagarela (conversa não pode atrasar nem inflar a confirmação de um pedido).

## Alcance do Tom — edição, hábitos, pesquisa ampliada, busca semântica e leitura de arquivos (2026-10, motivo documentado)

Decisão do dono do produto: implementar as 6 lacunas levantadas num mapeamento de alcance. Detalhe e
trade-offs em `docs/adr/0006-alcance-do-tom-edicao-habitos-pesquisa-visao.md` — resumo:

- **Edição**: `update_task`/`update_note`/`update_reminder`/`update_calendar_event`/`delete_calendar_event`/
  `list_reminders`; agenda ganha `tomorrow`/`next_7_days`/intervalo por data. Remarcar nunca é apagar e recriar.
- **Hábitos** (`habits`/`habit_checkins`, migration `0025`, antes `0023` — renumerada por colisão com `0023_trial_3_dias`): check-in diário por data local, sequência calculada em
  código. **Reverte** o corte "Hábitos/rotina com acompanhamento" da rodada de expansão B2C acima (pedido explícito).
  Sem cobrança proativa de check-in ainda.
- **Pesquisa**: `web_search` com `current_info` (notícia/resultado, cache de 20 min), `get_weather` (qualquer cidade
  do BR) e `get_market_rate` (dólar/euro/libra/Selic/CDI/IPCA do Banco Central, sem chave). Dado que a fonte não
  trouxe = "não consegui checar", nunca chute.
- **Busca semântica** em notas e documentos (migration `0026`, antes `0024` — renumerada por colisão, pgvector): híbrida, exato primeiro e parecido marcado
  `related`. Vetor é bônus — sem `OPENAI_API_KEY` a busca por texto continua; backfill horário no sweep.
- **Leitura de foto/PDF**: o Tom lê comprovante/conta/foto (visão do Claude), guarda o que leu (entra na busca) e
  responde. **Nunca registra gasto sozinho a partir do arquivo** — pergunta, salvo se a legenda já pedir. Não
  transcreve CPF/RG/cartão/PIX. Arquivos antigos não são relidos retroativamente.

Migrations `0025_habits.sql` e `0026_semantic_search_and_document_reading.sql` precisam ser aplicadas no Supabase
antes do deploy. Tools registradas: 43 → 55 (~28,5KB de schema, ~7,1K tokens estimados; perto do patamar de ~10K
onde `tool_search`/`defer_loading` compensa). **Atualizado em 2026-10:** 67 tools / ~6,9K tokens depois de enxugar descrições
(ver seção "Capacidades do Tom" abaixo e o teste de orçamento).

## Capacidades do Tom — balões, memória, listas, contas, dia e rotinas (2026-10, motivo documentado)

Pedido do dono do produto: implementar 14 das 16 sugestões de uma lista de capacidades (1, 3, 4, 5, 6, 7, 8, 9, 10, 11,
12, 13, 14, 15; **fora**: 2 resposta em áudio e 16 atalhos de captura rápida). Detalhe e trade-offs em
`docs/adr/0009-capacidades-do-tom-listas-contas-rotinas.md` — resumo:

- **Orçamento de tools respeitado**: o schema estava em 62 tools / ~8,1K tokens. Só 5 tools novas, cada uma com várias
  ações (`manage_list`, `calculate`, `manage_installments`, `time_utils`, `get_day_overview`) + `set_morning_digest_preferences`
  estendida, e as descrições existentes foram enxugadas: **67 tools, ~27,5KB ≈ 6,9K tokens**. `tool-registry.budget.test.ts`
  trava o teto (7,4K padrão / 8,2K com painel e cobrança ligados) e o tamanho de cada descrição. Capacidade nova entra como
  ação de tool existente. `tool_search`/`defer_loading` segue **não implementado** (abaixo do patamar de ~10K; sem como validar).
- **Comandos diretos sem LLM** (`commands/`): só mensagem inteira e exata — `hoje`, `amanhã`, `semana`, `tarefas`, `gastos`,
  `listas`, `lista de <nome>`, `desfazer`, `ajuda [assunto]`, `dica`, `foco [N]`, `fechamento do dia`, `revisão da semana`,
  ligar/desligar resumo, dicas, fechamento, revisão e check-ins. Frase maior vai pro LLM. `null`/erro do atalho cai no LLM.
  **Resposta curta a uma pergunta do Tom nunca é comando** ("amanhã" respondendo "pra quando?" vai pro LLM).
  "O que você faz?" continua conversa (nunca bula) e aponta pro `ajuda`.
- **Balões + "digitando…" + reação**: linha em branco na resposta = novo balão (máx. 3); falha no 1º balão propaga (retry da
  fila), falha depois nunca propaga (duplicaria). Agradecimento puro vira ❤️ (só agradecimento, nunca depois de pergunta do
  Tom; `ok`/`blz` vão pro LLM). Cloud API completa; Evolution só "digitando…".
- **Memória longa da conversa**: resumo rolante em Postgres (`conversation_summaries`), atualizado depois da resposta enviada a
  cada ~8 trocas, injetado como DADO na camada semi-estável. **Espelho do jeito de escrever**: heurística pura, camada volátil.
- **Listas, conta exata, parcelas, dia**: o Tom nunca faz aritmética de cabeça (`calculate`); parcelas **não lançam gasto**;
  "monta meu dia" usa agenda + tarefas + lembretes + horários livres na janela acordada (derivada do horário de silêncio) e
  nunca afirma "dia livre" se uma fonte falhou; hora em outros lugares só da tabela fechada (desconhecido = "não sei").
- **Rotinas proativas dentro do sweep horário** (sem fila nova, por causa da cota do Redis; idempotentes via
  `proactive_message_logs`): check-in "como foi?" (ligado; compromissos criados pelo Tom + tarefas com hora; ≤2/dia, 8h–20h),
  dica semanal de habilidade ainda não usada (ligada; quarta 11h, ≥3 dias de uso, nunca repete), **fechamento do dia (20h) e
  revisão da semana (domingo 18h) opt-in**. Respeitam o horário de silêncio. Limitação: evento criado fora do Tom não gera check-in.
- Sem painel, preço ou teste grátis nos textos novos (teste garante) e no máximo 1 emoji por linha.

Migration `0028_tom_capabilities.sql` precisa ser aplicada no Supabase ANTES do deploy (o sweep horário passou a selecionar
`routine_*` de `users`). Não validado com usuários reais: observar se os balões ficam naturais, quantos check-ins viram
resposta e se o resumo da conversa carrega ruído.

## Indicadores econômicos no bom dia (2026-10, pedido do dono do produto)

Mensagem **à parte, depois do bom dia**, com os indicadores que a pessoa escolheu: dólar, euro, libra, Selic (meta), CDI, IPCA do
mês e IPCA em 12 meses (`markets/digest.ts`; dados do Banco Central via `markets/bcb.ts`, os mesmos da tool `get_market_rate`).
- **Oferta única**: quem nunca foi perguntado (`users.indicators_offered_at` nulo) recebe, no fim do resumo, uma mensagem que lista
  as opções e pergunta se quer; vai pro histórico da conversa (pra "quero o dólar e a Selic" fazer sentido) e só é marcada como feita
  DEPOIS de entregue. Nunca no mesmo dia da pergunta de tarefa atrasada (duas perguntas seguidas confundem a resposta; fica pro dia
  seguinte). Ignorou = não pergunta de novo.
- **Escolha** via `set_morning_digest_preferences(indicators: [...])` (sem tool nova; "todos" = os 7 códigos; `[]` remove). Vale a partir
  do dia seguinte, no mesmo sweep/handler do resumo (`morning-digest-generate.ts`), sem fila nova.
- **Cache** (`markets/bcb.ts`): o valor é o mesmo pra todos, então `fetchMarketRate` guarda por indicador + dia em memória do
  worker (30 min; falha 5 min) e divide a requisição entre pedidos simultâneos — antes, cada pessoa com indicadores escolhidos
  disparava até 7 chamadas ao Banco Central na hora do pico. TTL curto porque o BC publica o câmbio à tarde. Vale também pra tool
  `get_market_rate`.
- Honestidade: indicador que a fonte não trouxe sai da mensagem; nenhum valor = a mensagem não sai. Câmbio é a taxa de venda do último
  fechamento, e a mensagem diz isso.
- Migration `0029_morning_digest_indicators.sql` precisa ser aplicada no Supabase ANTES do deploy (o sweep horário seleciona as colunas novas).
- **Clima ausente no bom dia (diagnóstico de 2026-10-29):** o código só omite a previsão sem `OPENWEATHERMAP_API_KEY` **no `.env` do worker
  (VPS)** — não basta estar na Vercel — ou com chave recém-criada (OpenWeatherMap leva de minutos a ~2h para ativar, 401 até lá). O worker
  agora loga `weather_api_key_missing` (uma vez por processo) quando falta a chave; chave inválida/inativa aparece como `weather_forecast_http_error`.

## Recados para outras pessoas — o Tom redige, a pessoa envia (2026-10, motivo documentado)

Decisão do dono do produto: ao pedir "tom, manda um bom dia pra Aline", o Tom **gera a mensagem** e entrega um link
`wa.me` com o texto preenchido; **quem envia é a própria pessoa**, pelo WhatsApp dela. **O Tom não envia nada a
terceiros** — não revisitar sem pedido explícito. Detalhe e caminhos descartados (envio pelo número do Tom e pelo
WhatsApp pessoal via Evolution/ZapScript) em `docs/adr/0007-recados-a-terceiros.md`. Resumo:

- `draft_message_for_contact` redige na voz da pessoa, só com o que ela pediu (nunca inventa conteúdo) e devolve texto +
  link. Contatos (`contacts`) são só nome+número, salvos por conversa ou cartão de contato encaminhado; ambiguidade →
  pergunta qual.
- Log (`message_drafts`, painel "Recados redigidos pelo Tom"): **só reflete o que a pessoa conta** ("mandei", "ela
  respondeu ..."). O Tom nunca afirma que foi enviado, entregue, lido ou respondido por conta própria.
- Migration `0027_contacts_and_message_drafts.sql` precisa ser aplicada no Supabase antes do deploy (idempotente).

## Auditoria de ponta a ponta (2026-11, pedido do dono do produto: agenda, onboarding, interações e clima)

Cada achado foi confirmado lendo o código antes de corrigir; testes 891 → 1.069. O que mudou e por quê:

- **Agenda (Google/Outlook)**: o refresh token do Outlook ROTACIONA a cada renovação (o novo era descartado e a conexão morria em ~90
  dias) — agora é regravado cifrado, com update condicional ao token anterior. Token revogado vira `CalendarAuthError`: a conexão morta sai
  e a agenda conta como não conectada (erro transitório NÃO apaga a conexão). Outlook agora pagina (`$top`/`@odata.nextLink`, só links do
  Graph), dia inteiro é só data (convenção do projeto), conflito só conta o que ocupa horário, criação é idempotente (Google `id`, Graph
  `transactionId`), `delete_calendar_event` não diz "apaguei" de id inexistente. **Limitação conhecida:** depois da revogação a pessoa só
  reconecta pelo painel, que está desligado por padrão (ADR 0008) — o Tom a trata como "sem agenda" e sugere salvar como tarefa.
- **Sweep horário**: o `jobId` do insight tinha `:` a mais (o BullMQ exige exatamente 3 partes) e lançava — nenhum insight proativo era
  enfileirado. Corrigido com teste que trava a regra. Conta que falha não derruba as outras; dono sem onboarding é pulado.
- **Onboarding**: o 2º reengajamento caía em 24h–25h, fora da janela de texto livre da Meta (nunca chegava) — agora 2h e 20h, respeitando
  o horário de silêncio no fuso da pessoa. O prompt de onboarding não tinha data/hora (e manda atender o pedido da 1ª mensagem): o
  relógio, com o deslocamento do fuso, vale nos dois estados. 1ª mensagem como foto/PDF recebe apresentação e pergunta do nome. Nome e
  ocupação passam por allowlist (o nome entra no prompt de toda mensagem). `set_city` passa a definir o fuso pela UF.
- **Datas das tools** aceitam deslocamento (`-03:00`): o `datetime()` padrão do zod só aceitava `Z`, e o modelo recebe a hora local.
- **Webhooks**: falha de infra (fila/banco fora do ar) responde 5xx pra Meta reentregar; antes era 200 e a mensagem se perdia. Não duplica
  (`jobId` = id da mensagem, retido 24h). Número inválido e rate-limit seguem 200.
- **Turno reexecutado não repete efeito** (`llm/turn-ledger.ts`): se o Claude executa uma tool e a chamada seguinte falha, o fallback
  (OpenAI) ou o retry do job recomeçava e duplicava o gasto/tarefa. Agora chamadas idênticas a uma já executada no mesmo turno (chave = id da
  mensagem) devolvem o resultado gravado. Em memória do worker, não no Redis (cota). `logToolCall` falhando nunca vira "erro" de uma ação
  que aconteceu. Modelo sem texto depois de uma ação bem-sucedida → confirmação neutra, não "não consegui processar". Clientes LLM com
  timeout de 45s e 1 retry (o padrão do SDK espera 10 min).
- **Lembretes**: o lembrete vira job atrasado no Redis, que já perdeu jobs duas vezes (cota estourada, banco recriado) — ficava `pending`
  pra sempre e nunca chegava. O sweep horário agora reconcilia (`reminders-reconcile.ts`): vencido há 10 min–24h e ainda `pending` é
  reenfileirado com o próprio id como `jobId` (job existente = o BullMQ ignora, nada em dobro); vencido há mais de 24h vira `failed` com
  o motivo (some do pendente, aparece no card de falhas); pessoa em horário de silêncio é adiada (atrasado de madrugada só acorda).
  Recorrente: a próxima ocorrência é garantida ANTES de marcar a atual como enviada, de forma idempotente (antes, falha transitória
  ali matava a série em silêncio). Desvio do mensal em dia 31 segue como decisão deliberada (`recurrence.ts`).
- **Deploy do worker**: `stop_grace_period: 120s` no compose. O padrão do Docker (SIGKILL em 10s) matava turno de LLM em andamento a
  cada push em `main` e, com o `stalledInterval` de 1h, a pessoa ficava até 1h sem resposta.
- **Segurança/robustez**: CSV do export neutraliza fórmulas; rate-limit com `INCR`+`EXPIRE` atômico (Lua); corridas na criação de usuário/conta.
- **Clima**: a chave é aparada (espaço/quebra de linha no `.env` virava 401) e o aviso de "chave ausente" vale também pro geocoding; erros
  HTTP logam a mensagem da API. `get_weather` ganhou **como está agora** (`now`, endpoint de observação atual) pra "tá frio/chovendo
  agora?" — antes respondia com a previsão do próximo bloco de 3h; ausente = a fonte não trouxe, nunca inventado. Dias de outra cidade são
  agrupados no fuso DELA (`city.timezone` da resposta), não no de quem pergunta. O worker informa no heartbeat quais chaves opcionais tem
  (`/admin/status`, só presença) — é o jeito de saber, sem acessar a VPS, se o clima do bom dia está ativo. **Limitação conhecida:** a mínima
  da narrativa é a do que RESTA do dia (o endpoint de 3h não traz os blocos já passados), então de manhã ela pode ficar acima da madrugada
  real; só o caso mínima = máxima foi ajustado no texto ("20°C", não "20°C a 20°C").

## Novas interações, conversas, proposições e conhecimento (2026-11, pedido do dono do produto)

Guia de onde acrescentar cada coisa: `docs/conteudo-conversacional.md`. O que entrou:

- **Atalhos sem LLM** (mensagem inteira e exata, como os anteriores): `lembretes`, `notas`, `contas`, `metas`, `hábitos`, `datas`
  (`commands/collections-format.ts`, formatadores puros, só registro da própria pessoa; vazio ensina em uma frase como criar),
  `revisão do mês` e `sugestão`. A revisão compara o mês até ontem com o MESMO trecho do mês passado (no dia 1, fecha o mês passado
  inteiro); receitas saem como "registradas" (um saldo seria falso pra quem não registra o que entra); variação só com as duas bases
  > 0; fonte que falhou some em vez de virar zero. `sugestão` dá até 3 próximos passos por prioridade (atrasadas, data próxima, hábito
  pendente, gasto +20% sobre o mesmo trecho, tarefas sem data, sem meta/conta/lembrete) **só com dado lido**: fonte que não deu pra
  ler vira `null` e a sugestão NÃO sai. "ideia" e "resumo do mês" ficaram de fora de propósito (ambíguos). Sem migration e sem tool
  nova (o orçamento de tools não mudou).
- **Histórico das mensagens proativas** (`context/proactive-history.ts`): lembrete disparado, insight, resumo semanal, aviso de data e
  reengajamento passam a entrar na conversa (melhor esforço, nunca derrubam o envio; depois da marca de "já disparado", então um retry
  não registra em dobro). Antes, "adia pra amanhã" respondendo a um lembrete chegava ao LLM sem saber de qual.
- **Situações de conversa** (+9, só as que a personalidade ainda não cobria): ansiedade antes de evento, pedir opinião, sonho ou plano,
  curiosidade sobre gasto (busca o número, não opina), "esqueci o que tinha pra fazer" (consulta antes de responder), "você
  consegue…?", privacidade (honesto: não afirma criptografia, certificação nem retenção; apagar a conta é com a equipe), voltar depois
  de sumir (sem "senti sua falta": é uma IA) e parar mensagens (aceita sem reter; desliga o que existe e diz o que não dá).
- **Proposições como dados** (`llm/proposals.ts`, 15, as 6 antigas + 9): cada uma aponta pra uma tool que existe ou um atalho que
  existe (teste valida contra o registro e o parser), o exemplo é uma pergunta, e nenhuma afirma que algo já foi feito. Regra mantida:
  uma por resposta, nada criado sem o "sim", e não propor com a pessoa estressada, triste ou depois de uma recusa.
- **Conhecimento** em listas testáveis (`MONEY_KNOWLEDGE`/`TIME_KNOWLEDGE`): fatura (fechamento × vencimento, pergunta a data do cartão),
  compra por impulso, assinaturas esquecidas, meta com valor e prazo, dinheiro dividido, comprovantes (regra atual por `web_search`),
  lembrete que descreve a ação, véspera, deslocamento, fuso. Teste barra `%` e `R$` (número que muda com o tempo vem de busca) e nome de
  banco/ativo. Corrigido: o repertório dizia "você não rastreia hábito", o que deixou de ser verdade.
- **Parar mensagens automáticas** (achado da auditoria: o insight das 19h e o resumo semanal de sexta não tinham como ser desligados, só
  silenciados pelo horário; mensagem automática sem saída gera bloqueio do número, e bloqueio derruba a qualidade dele): atalhos
  `parar mensagens` / `ligar mensagens` (bom dia, check-ins, dica, fechamento, revisão, insight e resumo semanal) e
  `desligar/ligar insights` e `resumo semanal`; a tool `set_morning_digest_preferences` ganhou `insights` e `weekly_digest`.
  **Lembretes que a pessoa marcou e avisos de data importante continuam valendo** (foram pedidos por ela). "Ligar mensagens" não religa o
  fechamento do dia nem a revisão da semana (são opt-in). Migration `0031_proactive_opt_out.sql` (2 colunas boolean, default ligado):
  **o código tolera não estar aplicada** — o sweep lê as colunas numa consulta SEPARADA com fallback para "ninguém desligou"
  (`listProactiveOptOuts`, nunca lança), então o deploy antes do SQL não derruba o bom dia de ninguém; sem ela só não dá pra DESLIGAR, e o
  Tom diz "não consegui" (`not_saved`) em vez de confirmar um "desliguei" que não aconteceu. **Falta o dono do produto aplicar a 0031.**
- **Custo**: +cerca de 1.900 tokens no bloco estável (cacheado); tetos nos testes (conversa 11.000, proposições 6.000, conhecimento 8.000
  caracteres). Golden set 66 → 75 casos (conversa). **Não validado contra o modelo real**: rodar `npm run eval:golden` antes de
  confiar, e observar nas conversas se as proposições novas deixaram o Tom insistente (a regra de uma por resposta é o freio).

## Curadoria das interações (2026-11, pedido do dono do produto)

`/admin/curadoria` + `docs/adr/0011-curadoria-das-interacoes.md` (proposta completa de como criar e exercer). **Camada 1 implementada:**
fila de revisão sobre sinais implícitos já gravados em `tool_call_logs` (pessoa desfez, falha de tool, correção até 10 min depois de
criar, categoria em fallback), com veredito (`acertou`/`ruido`/`errou` + destino prompt/categoria/bug/exemplo) em `curation_reviews`
(migration `0030`, sem FK porque os logs somem em 90 dias; trecho guardado já mascarado) e métrica "sinais por 100 chamadas". Não
guarda nenhum texto novo de conversa. **Golden set implementado** (`packages/core/src/eval/`, 66 casos sintéticos; `npm run eval:golden`
ou workflow manual "Eval do golden set" com o secret `ANTHROPIC_API_KEY`; validação estática roda na CI): mede qual tool o Tom escolhe e com
quais argumentos, com a mesma requisição da produção (`buildAnthropicRequestParts`, extraída do provider). Rodar antes de mudar prompt, modelo
ou `effort`. **Feedback por reação (2A) e captura de texto (2B) estão adiados**, com motivo no ADR 0011 — texto de conversa continua só no
Redis (24h); não implementar captura sem consentimento, opt-out e parecer jurídico.

## Métricas por fase

- MVP: % usuários com ≥1 mensagem/dia na semana 1; tempo até 1ª ação concluída
  - **Medido em `/admin/mvp`** (2026-11, sem migration; `packages/db/src/mvp-metrics.ts` = definições e cálculo puro, testado;
    `repositories/mvp-metrics.ts` = leitura de `users` + `webhook_events` + `tool_call_logs`). Coorte = cadastros dos últimos 30
    dias; retenção só conta quem já completou os 7 dias; "dia N" = N-ésima janela de 24h desde o cadastro; "mensagem" = texto,
    áudio ou documento aceito; "ação" = registro criado de fato (tarefa, lembrete, nota, gasto, evento, data, meta, conta, hábito).
    Com poucos cadastros o percentual oscila muito — ler junto com o tamanho da coorte.
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
