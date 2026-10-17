# ZapBuddy

Assistente pessoal via WhatsApp com IA para organização financeira, agenda, tarefas e documentos. Nicho inicial: autônomos e pequenos negócios (MEI/PJ). Diferencial central: IA **proativa** (antecipa e sugere), não só reativa a comandos.

Referência de mercado estudada: meuassessor.com (6 "assessores" especializados, Open Finance, R$29,90/mês). ZapBuddy compete por nicho + proatividade de IA, não por paridade de feature.

## Stack (decidida — não revisitar sem motivo forte)

- **Backend:** Node.js + TypeScript
- **Banco/Auth/Storage:** Supabase (Postgres + Storage + Auth) — MCP já disponível neste ambiente
- **Deploy (API + dashboard web):** Vercel — MCP já disponível neste ambiente
- **Fila assíncrona:** BullMQ + Redis (transcrição de áudio, ações demoradas)
- **Canal:** WhatsApp Cloud API oficial (Meta) é o canal **padrão e obrigatório** para qualquer usuário real/dados financeiros.
  - **Amendamento 2026-10 (motivo documentado):** suporte opcional à Evolution API (gateway Baileys self-hosted, mesma usada pelo ZapScript em `deploy/evolution-oci`) como canal alternativo via `WHATSAPP_CHANNEL_PROVIDER=evolution`, só para ambientes de teste/staging ou contingência operacional (ex.: aprovação do número oficial atrasada). Risco de ban e fragilidade para dado financeiro continuam valendo para esse caminho — por isso ele nunca é o default (`WHATSAPP_CHANNEL_PROVIDER` default é `cloud-api`) e qualquer deploy de produção com usuários reais deve permanecer em `cloud-api`. Não é dual-send automático: é uma troca manual de canal via env var.
- **LLM:** Claude (Anthropic), via tool use/function calling — cada "assessor" é um conjunto de tools, não um serviço separado.
  - **Amendamento 2026-10 (motivo documentado):** fallback automático pra OpenAI (`OPENAI_API_KEY`, reaproveitada do fallback de transcrição) quando o Anthropic falha por qualquer motivo — já causou indisponibilidade total em produção (créditos esgotados, sem rede de segurança). Claude continua o provider primário e decidido; OpenAI só assume quando o Anthropic erra, nunca por preferência/custo. Arquitetura em `packages/core/src/llm/providers/` (`config.ts` = ordem de prioridade, `orchestration.ts` = tenta em ordem e loga qual provider respondeu), inspirada no sistema multi-provider de `mycollect` (`src/lib/vision/providers/`). Cada provider roda seu próprio loop de tool-use e usa a mesma `runToolCall()` — a regra não-negociável abaixo (nunca inventar dado financeiro) vale igual não importa qual LLM decidiu chamar a tool.
- **Dashboard web:** Next.js (App Router), somente leitura no MVP, login via magic link disparado pelo WhatsApp

## Arquitetura (fixa)

```
WhatsApp Cloud API → webhook (Vercel function)
  → fila (BullMQ) para áudio/transcrição e ações lentas
  → orquestrador LLM (Claude + tools)
  → módulos de ação (finance, tasks, reminders)
  → Postgres (Supabase)
  → resposta ao usuário no WhatsApp
```

Regra de design não-negociável: a IA nunca "inventa" dado financeiro. Toda transação/tarefa é persistida como registro estruturado antes de qualquer resposta confirmar a ação. Contexto de conversa (curto prazo) e dados estruturados (longo prazo) ficam em camadas separadas.

Logar toda tool call da IA (nome + parâmetros + resultado) desde o primeiro commit — é o principal insumo de debug de erros de interpretação de linguagem natural.

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
   dúvida geral fora do domínio financeiro/tarefas (ex.: "o que é o MEI",
   "taxa do Simples esse ano") e pra identificar um estabelecimento
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
   nicho (MEI, Simples Nacional, organização financeira pra autônomo) e
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
