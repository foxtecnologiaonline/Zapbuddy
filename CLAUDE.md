# ZapBuddy

Parceiro pessoal 24 horas via WhatsApp com IA para gestão do tempo (agenda e compromissos pessoais), organização de tarefas e notas pessoais, e gestão financeira. Público: consumidores finais (B2C), pessoas físicas. Diferencial central: IA **proativa** (antecipa e sugere), não só reativa a comandos. Documentos entram como suporte a esses três pilares (ex.: comprovante de um gasto), não como um quarto pilar independente.

Referência de mercado estudada: meuassessor.com (6 "assessores" especializados, Open Finance, R$29,90/mês) e Pierre (app de finanças pessoais da CloudWalk). ZapBuddy compete por proatividade de IA e pela cobertura da rotina pessoal num só canal, não por paridade de feature.

## Público e escopo (2026-10, motivo documentado)

Decisão do usuário: o público é B2C, não MEI/PJ. O foco do Tom é:

- Gestão do tempo: agenda e compromissos pessoais
- Organização de tarefas e notas pessoais
- Gestão financeira pessoal
- Parceiro disponível 24 horas por dia, sempre pelo WhatsApp

Itens de negócio (fluxo de caixa de MEI/PJ, DAS, nota fiscal) não são nicho do produto. Não revisitar esse recorte sem pedido explícito do usuário.

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
