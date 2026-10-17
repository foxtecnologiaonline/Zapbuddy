# Tom — roteiro de interações (IA do ZapBuddy)

> **Reconciliado com o código real em 2026-10-17.** Esta versão foi revisada contra
> `packages/core/src/llm/*` e `packages/db/src/repositories/*` depois de ter sido escrita sem
> visibilidade da implementação (que já existia em outras branches/sessões). Nomes de tool,
> schemas e categorias abaixo batem com o código. Cenários que **não têm tool/job correspondente
> hoje** ficam marcados com ⚠️ e continuam aqui só como proposta de produto, não como
> documentação do que existe.

Persona da IA no WhatsApp: **Tom**. Para cada interação: mensagem do usuário → **consequência**
(tool call real + persistência) → **resposta**. Nomes de tool, schemas e comportamento de
validação são os de `packages/core/src/llm/tools/*.ts` — ver `docs/tools-contrato.md` para o
contrato completo.

## Tom — tom de voz (de `system-prompt.ts`)

- Conversa, não menu de comando — texto ou áudio tratados igual, sem palavra-chave fixa.
- Mensagens curtas (1–3 frases), confirmação natural ("Beleza, 35 reais de almoço anotado"), não
  um recibo técnico.
- Nunca confirma gasto/receita/tarefa/lembrete antes de ter chamado a tool correspondente — a
  confirmação só pode vir depois do resultado da tool, nunca antes.
- Dúvida pequena (categoria não-óbvia) o modelo resolve com o melhor julgamento dele; valor
  ausente ou claramente ambíguo, ele pergunta antes de chamar a tool.
- **Proatividade real hoje é só o disparo de lembrete agendado** (fila `reminder-dispatch`).
  ⚠️ Não existe job de resumo diário/semanal proativo — só resumo quando o usuário pergunta.

Valores são sempre normalizados para `amount_cents` (inteiro, em centavos) antes de chamar a
tool financeira — "30 reais" → `3000`, "R$ 30,50" → `3050`.

**Nota de sintaxe:** as respostas abaixo usam `**negrito**` por ser a convenção markdown deste
documento. A sintaxe de negrito do WhatsApp é `*negrito*` (um asterisco de cada lado) — a
mensagem enviada pela API nunca deve conter `**` literal.

---

## 1. Onboarding (primeiro contato)

Real: o webhook chama `getOrCreateUser(whatsappNumber)` antes de qualquer resposta — cria a
linha em `users` com `onboarding_completed_at: null` se o número é novo. O system prompt então
entra no estado de onboarding enquanto esse campo for nulo.

### 1.1 Primeira mensagem de sempre

**Usuário:** "oi"

**Consequência:** `getOrCreateUser` (fora do orquestrador, no webhook) — nenhuma tool call do
LLM ainda, pois não há nada pra persistir a partir de "oi".

**Resposta:**
> Oi! Eu sou o Tom 👋 Vou te ajudar a organizar seu dinheiro, tarefas e lembretes por aqui
> mesmo. Pra começar, qual é seu nome?

### 1.2 Usuário informa o nome

**Usuário:** "Marcos"

**Consequência:** `complete_onboarding` — `{name: "Marcos"}` → grava `name` e
`onboarding_completed_at`.

**Resposta:**
> Prazer, Marcos! Já pode me mandar um gasto, uma tarefa ou um lembrete que eu organizo tudo.
> Por exemplo: "gastei 45 no almoço" ou "lembrar de pagar o DAS dia 20".

### 1.3 Nome + pedido na mesma mensagem

**Usuário:** "sou o Marcos, gastei 45 no almoço"

**Consequência:** o system prompt instrui resolver os dois na mesma resposta — `complete_onboarding`
`{name: "Marcos"}` seguido de `record_transaction` `{type: "expense", amount_cents: 4500,
category: "alimentacao"}`, nessa ordem, antes de responder.

**Resposta:**
> Prazer, Marcos! Já anotei os 45 reais do almoço. Pode me mandar gasto, tarefa ou lembrete
> quando quiser.

> ⚠️ **Não implementado:** uma versão anterior deste roteiro descrevia um segundo passo de
> onboarding perguntando o "segmento" (autônomo/PJ) e um terceiro perguntando preferência de
> resumo diário (sim/não). Nenhum dos dois tem campo no modelo de `User`
> (`id, whatsapp_number, name, timezone, onboarding_completed_at, created_at`) nem tool — o
> onboarding real termina em `complete_onboarding`.

---

## 2. Financeiro — registro de gasto/receita

Categorias canônicas e o comportamento real de normalização (nunca rejeita, cai em `outros`)
estão em `docs/categorias-financeiras.md`. `amount_cents` é sempre inteiro.

### 2.1 Gasto simples por texto (caminho feliz)

**Usuário:** "gastei 45 reais no almoço"

**Consequência:** `record_transaction` — `{type: "expense", amount_cents: 4500, category:
"alimentacao", description: "almoço"}` → `{transaction_id, recorded: true, category:
"alimentacao", category_fallback: false}`.

**Resposta:**
> Beleza, 45 reais de almoço anotado. 🍽️

### 2.2 Receita

**Usuário:** "recebi 1200 de um projeto"

**Consequência:** `record_transaction` — `{type: "income", amount_cents: 120000, category:
"servico_prestado", description: "projeto"}`.

**Resposta:**
> Boa! 1.200 reais de serviço prestado registrados. 💰

### 2.3 Áudio (transcrição assíncrona)

**Usuário:** [áudio] "paguei 230 de internet e telefone"

**Consequência:**
1. Webhook enfileira o áudio na fila `audio-transcription` (BullMQ).
2. Worker transcreve e enfileira o texto resultante na fila `incoming-message`, que roda o
   orquestrador normalmente — chega como se fosse texto digitado
   (`messageSource: "audio"` no `ToolContext`, só isso muda).
3. `record_transaction` — `{type: "expense", amount_cents: 23000, category: "moradia",
   description: "internet e telefone"}` (categoria real mais próxima; não existe
   `utilidades_telecom` na lista canônica).

**Resposta (única, depois do processamento — não há uma "resposta imediata" separada hoje):**
> Beleza, 230 reais de internet e telefone anotados. ✅

> ⚠️ **Divergência de uma versão anterior:** este roteiro descrevia duas mensagens (uma
> confirmação imediata de "recebi seu áudio" e depois a confirmação do valor). O pipeline real
> não manda uma mensagem intermediária por padrão — só processa e responde uma vez, pela fila
> `incoming-message`. O aviso de turno lento (2.3b abaixo) é o único "estou processando" que
> existe, e só dispara se passar de 8s.

### 2.3b Turno lento (implementado, mas por timeout de LLM, não de transcrição)

**Gatilho:** `runLlmWithFallback` (`packages/core/src/llm/providers/orchestration.ts`) não
terminou em `INTERIM_NOTICE_MS` (8s) — cobre qualquer turno lento, incluindo troca pro provider
de fallback (OpenAI), não é específico de áudio.

**Consequência:** nenhuma escrita — só envia `MESSAGES.stillProcessing` via WhatsApp, sem
abortar o processamento em curso.

**Resposta (mensagem intermediária):**
> Só um instante, ainda to vendo isso pra você...

### 2.4 Valor não informado — pergunta antes de chamar a tool

**Usuário:** "gastei no mercado"

**Consequência:** nenhuma tool call — `record_transaction` exige `amount_cents > 0`; o modelo
pergunta antes de inventar um valor.

**Resposta:**
> Quanto foi?

**Usuário:** "uns 150"

**Consequência:** `record_transaction` — `{type: "expense", amount_cents: 15000, category:
"outros"}` — "mercado" não está na lista de categorias de despesa; `category_fallback: true`
no retorno.

**Resposta:**
> Anotados os 150. 🛒

### 2.5 Categoria incerta — pergunta em vez de adivinhar

**Usuário:** "gastei 300 com a Maria"

**Consequência:** nenhuma tool call ainda — descrição não dá pista de categoria (dúvida grande,
não "pequena"), então o modelo pergunta em vez de resolver sozinho.

**Resposta:**
> Esses 300 com a Maria foram de quê?

**Usuário:** "pagamento de uma freelancer que me ajudou"

**Consequência:** `record_transaction` — `{type: "expense", amount_cents: 30000, category:
"fornecedores", description: "pagamento freelancer - Maria"}`.

**Resposta:**
> Certo, 300 reais com a Maria anotados.

### 2.6 Correção de lançamento ⚠️ não implementado

**Usuário:** "errei, o almoço foi 54 não 45"

> ⚠️ **Não existe tool de correção/edição de uma transação já registrada.** Nenhuma versão do
> código (`packages/core/src/llm/tools/finance.ts`) expõe um `update_transaction` ou
> equivalente. Hoje, essa mensagem provavelmente seria interpretada como um novo gasto
> (duplicando o lançamento) ou como algo que o modelo não sabe resolver — comportamento real
> não testado para este caso. Fica registrado aqui como lacuna de produto, não como algo que
> funciona.

### 2.7 Resumo do dia ⚠️ não é proativo

**Usuário:** "como estão meus gastos hoje?"

**Consequência:** `get_financial_summary` — `{period: "today"}` → `{totalIncomeCents,
totalExpenseCents, byCategory, count}` calculado no fuso do usuário. Leitura, sem escrita.

**Resposta:**
> Hoje: 299 reais em gastos (maior categoria: mercado) e 1.200 em receita. Saldo positivo.

> ⚠️ Uma versão anterior deste roteiro descrevia esse resumo disparando sozinho às 20h. Isso
> não existe — não há fila/cron de resumo proativo (`packages/core/src/queues/definitions.ts`
> só tem `audio-transcription`, `incoming-message` e `reminder-dispatch`). O resumo só acontece
> quando o usuário pergunta.

### 2.8 Resumo dos últimos 7 dias

**Usuário:** "como foi minha semana?"

**Consequência:** `get_financial_summary` — `{period: "last_7_days"}`. **Não é** "semana de
calendário" (domingo–sábado) — é janela rolante de hoje + 6 dias anteriores, no fuso do
usuário.

**Resposta:**
> Nos últimos 7 dias: 1.450 em gastos (mercado foi o maior, 480) e 3.600 em receita.

---

## 3. Tarefas

### 3.1 Criar tarefa

**Usuário:** "preciso enviar a proposta pro cliente X"

**Consequência:** `create_task` — `{title: "Enviar a proposta pro cliente X"}` → `{task_id,
created: true}`.

**Resposta:**
> Adicionei: enviar a proposta pro cliente X.

**Usuário:** "até sexta"

**Consequência:** não existe `update_task` para alterar `due_at` de uma tarefa já criada — o
schema de `create_task` aceita `due_at` opcional na própria criação. Com as duas mensagens
separadas como acima, a tarefa já foi criada sem prazo e **não há tool para adicioná-lo depois**.
⚠️ Se o prazo vier na mesma mensagem ("enviar a proposta até sexta"), `create_task` resolve numa
chamada só, com `due_at` preenchido.

### 3.2 Listar tarefas

**Usuário:** "o que eu tenho pra fazer?"

**Consequência:** `list_tasks` — `{}` ou `{status: "pending"}` → `{tasks}`. Leitura, sem
escrita.

**Resposta:**
> Suas tarefas em aberto: enviar a proposta pro cliente X, pagar o DAS, revisar contrato.

### 3.3 Concluir tarefa

**Usuário:** "já enviei a proposta"

**Consequência:** `complete_task` exige `task_id` (uuid) — **não existe tool de busca por
descrição** (`findTaskByDescription`, como uma versão anterior descrevia). O modelo precisa
resolver qual `task_id` a partir do contexto da conversa (ex.: ele listou as tarefas antes e
guardou os ids no histórico curto). Se tiver o id com confiança: `complete_task`
`{task_id: "..."}`.

**Resposta:**
> Boa, marquei como concluída. 🎉

**Se não houver id resolvível no contexto:** o modelo não tem como chamar `complete_task` sem
um id — precisa primeiro chamar `list_tasks` e aí perguntar/confirmar qual, dentro da mesma
resposta ou da próxima.

### 3.4 Comando incompleto

**Usuário:** "concluir"

**Consequência:** nenhuma tool call — não há referência nenhuma a um `task_id`.

**Resposta:**
> Qual tarefa?

---

## 4. Lembretes

### 4.1 Criar lembrete agendado

**Usuário:** "lembrar de pagar o DAS dia 20"

**Consequência:** `create_reminder` — `{message: "pagar o DAS", remind_at: "<dia 20,
09:00 — horário preenchido pelo modelo a partir do fuso do usuário, não um default fixo no
código>"}` → persiste e enfileira o disparo (`reminder-dispatch`, BullMQ) com o delay calculado
até `remind_at`.

**Resposta:**
> Combinado, te lembro de pagar o DAS no dia 20.

### 4.2 Lembrete dispara (proativo)

**Gatilho:** worker processa o job `reminder-dispatch` quando `remind_at` chega.

**Consequência:** `markReminderSent` — `status: "sent"`. O worker só manda a mensagem
(`MESSAGES.reminder(message)`), sem chamar nenhuma tool financeira — isso nunca acontece
automaticamente.

**Resposta (Tom, só a afirmação — não uma pergunta):**
> ⏰ Lembrete: pagar o DAS

> ⚠️ Uma versão anterior descrevia o lembrete perguntando "já pagou?" e, numa resposta
> afirmativa, criando a transação e fechando o lembrete numa operação amarrada. O código real
> só envia a frase acima. Se o usuário responder "já, paguei 70" depois, isso é processado como
> uma mensagem comum — o modelo pode chamar `record_transaction` usando o contexto recente da
> conversa, mas não há vínculo formal entre esse lembrete e essa transação, nem atualização
> automática do `reminder` associado.

### 4.3 Usuário ainda não pagou ⚠️ não implementado

**Usuário:** "ainda não"

> ⚠️ **Não existe status `snoozed`.** Os status possíveis de `reminders` são `pending`, `sent`,
> `cancelled`, `failed` — não há como "adiar" um lembrete já disparado. Fica registrado aqui
> como lacuna de produto.

---

## 5. Dashboard web — acesso via magic link

### 5.1 Usuário pede para ver o painel

**Usuário:** "tem um painel disso?" / "quero ver meus gastos no site"

**Consequência:** `send_dashboard_login_link` — `{}` (sem parâmetros) → `createMagicLink` gera
token de uso único; retorno `{login_url, expires_in_minutes: 15}`.

**Resposta:**
> Aqui está seu acesso (expira em 15 min): {login_url}

### 5.2 Link expirado

**Usuário:** [avisa que o link não abre mais]

**Consequência:** validação do token acontece no backend do dashboard (Next.js + Supabase
Auth), não numa tool do Tom.

**Resposta:**
> Esse link expira rápido por segurança. Quer que eu gere um novo agora?

---

## 6. Casos de erro / limite do escopo

### 6.1 Mensagem não compreendida

**Usuário:** "fzr aquele trem lá"

**Consequência:** nenhuma tool call de escrita. `tool_call_logs` só registra chamadas que de
fato aconteceram — se o modelo não chamou nenhuma tool, não há linha de log pra esse turno
(diferente do que uma versão anterior sugeria).

**Resposta:**
> Não entendi — você quer registrar um gasto, uma tarefa ou um lembrete?

### 6.2 Pedido fora do escopo do MVP

**Usuário:** "conecta minha conta do banco aí"

**Consequência:** nenhuma. O system prompt instrui dizer com clareza que isso não é algo que o
Tom faz, sem inventar prazo.

**Resposta:**
> Isso eu ainda não faço por aqui. Mas pode me contar seus gastos e receitas por mensagem ou
> áudio que eu organizo tudo.

### 6.3 Pedido de recurso de outro canal

**Usuário:** "me manda isso por e-mail"

**Consequência:** nenhuma. Único canal é WhatsApp (mais o dashboard read-only via magic link).

**Resposta:**
> Só funciono aqui no WhatsApp — mas dá pra ver tudo organizado no painel web, se quiser.

### 6.4 Falha ao persistir o registro

**Usuário:** "gastei 80 no posto"

**Consequência:** `record_transaction` é chamada e a escrita no Supabase falha. `logToolCall`
grava `success: false` e `error`. Regra não-negociável: sem persistência confirmada, nenhuma
resposta de sucesso.

**Resposta:**
> Não consegui salvar esse gasto agora — pode tentar de novo em instantes?

---

## 7. Regras transversais

1. **Persistir antes de confirmar.** Toda tool de escrita (`record_transaction`, `create_task`,
   `create_reminder`, `complete_task`, `complete_onboarding`) acontece antes da resposta de
   confirmação. Se a escrita falhar, a resposta nunca confirma (caso 6.4).
2. **Nunca inventar valor.** `amount_cents` ausente ou claramente ambíguo sempre gera pergunta.
   **Categoria nunca bloqueia a escrita** — `record_transaction` sempre persiste, caindo em
   `outros` quando a categoria não é reconhecida (ver `docs/categorias-financeiras.md`); a
   pergunta sobre categoria incerta (caso 2.5) é uma escolha de UX do system prompt para dúvida
   grande, não uma validação da tool.
3. **Ambiguidade de referência trava a chamada, não a resposta.** `complete_task` exige
   `task_id`; sem um id resolvível no contexto da conversa, a tool simplesmente não pode ser
   chamada — o modelo precisa primeiro listar/perguntar.
4. **Log incondicional de toda tool call de fato executada** — `tool_call_logs` grava
   `tool_name`, `parameters`, `result`, `success`, `error`. Não há log de "intenção" quando
   nenhuma tool foi chamada (caso 6.1).
5. **A única proatividade real é o disparo de lembrete agendado.** Não existe job de resumo
   diário/semanal nem qualquer outro gatilho automático de mensagem.
6. **Categorização automática segue o julgamento do system prompt, não um limiar validado em
   código.** Dúvida pequena de categoria: resolve sozinho. Valor ausente ou dúvida grande:
   pergunta. A tool em si aceita qualquer categoria e nunca falha por isso.
7. **Turno lento tem aviso único.** Se o provider de LLM (com fallback) não responder em 8s
   (`INTERIM_NOTICE_MS`), uma mensagem de "ainda to vendo isso" é enviada uma vez, sem abortar
   o processamento (caso 2.3b).
8. **Lacunas conhecidas, sem tool hoje:** correção/edição de transação (2.6), snooze de
   lembrete (4.3), atualização de prazo de tarefa após criada (3.1), vínculo formal entre
   lembrete disparado e a transação que o confirma (4.2). Tratar como roadmap de produto, não
   como comportamento implementado.
