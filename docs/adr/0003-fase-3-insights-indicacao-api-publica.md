# ADR 0003 — Fase 3: insights proativos, programa de indicação, API/webhooks públicos

**Status:** aceito e implementado (2026-10). Escopo decidido com o usuário: **cobranças a
terceiros e nota fiscal explicitamente fora desta rodada** — nenhum provedor de pagamento
(Mercado Pago/Asaas/Efí) ou de emissão fiscal (eNotas/NFE.io/Focus NFe) foi decidido, e os dois
exigem credenciais reais de um provedor que o usuário ainda não escolheu. Fazer uma versão
"fake" de cobrança ou de nota fiscal seria pior que não ter a feature — cobrança sem rail de
pagamento real engana o usuário sobre se o dinheiro foi cobrado de verdade; nota fiscal é
documento fiscal regulado (varia por município, exige certificado digital/inscrição municipal do
negócio do usuário final) e não é algo que se simula com segurança. Ficam registradas aqui como
não implementadas, não como esquecidas.

## Contexto

Gate de retenção do MVP e autorização de Fase 2/3 já confirmados (ver amendamento em
`CLAUDE.md`). Esta ADR cobre as 3 frentes de Fase 3 que **não** dependem de um provedor externo
de pagamento/fiscal: insights proativos de IA (o diferencial central do produto, "antecipa e
sugere"), programa de indicação, e API/webhooks públicos.

## Decisão 1 — Insights proativos: sinais determinísticos, mensagem por template (sem nova chamada ao LLM)

A regra não-negociável do CLAUDE.md ("a IA nunca inventa dado financeiro") vale igual aqui: os
números de um insight proativo (ex.: "gasto em mercado 45% acima da média") vêm de agregação SQL
determinística sobre `transactions` — nunca de uma interpretação do modelo. Decisão adicional
desta ADR: a **mensagem em si também é um template fixo** (várias variações, tom do Tom),
preenchido com os números computados — não uma chamada nova ao LLM.

Motivo: adicionar "geração de texto livre a partir de fatos" como um segundo modo de chamada ao
LLM (além do loop de tool-use existente em `orchestrator.ts`) duplicaria a lógica de
fallback/retry/timeout dos providers com semântica diferente (ninguém está esperando resposta em
tempo real) e sem cobertura de teste própria nesta rodada. Os templates cobrem o essencial do
"antecipa e sugere" sem esse risco extra. Virar geração por LLM é evolução natural, não feita
agora.

**Sinais implementados (2, escopo deliberadamente pequeno):**
1. **Categoria de gasto fora do padrão** — gasto da semana corrente numa categoria ≥ 40% acima
   da média das 4 semanas anteriores nessa mesma categoria (mínimo R$50 pra evitar ruído em
   valores pequenos, mínimo de histórico pra ter uma média real).
2. **Ritmo de gasto do mês** — gasto do mês corrente até agora, projetado linearmente pros dias
   restantes, ≥ 20% acima do total do mês anterior.

No máximo 1 mensagem proativa por conta por dia (prioriza o sinal de categoria sobre o de ritmo
se os dois dispararem); nenhum sinal disparando = nenhuma mensagem (nunca manda só pra "ter
engajamento"). Outros sinais (receita atrasada, sazonalidade, etc.) ficam como evolução futura,
não implementados.

## Decisão 2 — Agendamento: sweep horário + janela de hora local por conta

Sem um scheduler teria que existir um cron real; decisão: uma fila BullMQ repetível
(`insights-sweep`, 1x/hora) varre todas as contas e, pra cada uma, calcula a hora local do
*dono* da conta (`account_members.role = 'owner'`, não todos os membros — ver decisão 4). Se a
hora local está na janela-alvo (19h) e nenhum insight já foi mandado hoje (log em
`proactive_insight_logs`, checado no fuso do dono), enfileira um job de geração por conta
(`insights-generate`). Granularidade de hora (não minuto) é suficiente — o produto não promete
"exatamente às 19:00", só "no fim do dia".

## Decisão 3 — Programa de indicação: código por conta, atribuição no primeiro contato

Toda conta nova ganha um `referral_code` (6 caracteres alfanuméricos, gerado na criação,
mesmo padrão de geração com retry do código de convite da Fase 2). Atribuição de indicação é
interceptada deterministicamente em `orchestrator.ts` (regex `indicado <código>`), no mesmo lugar
e pelo mesmo motivo do fluxo de convite — mas aqui não é bloqueante: código inválido/não
reconhecido só não gera o registro de indicação, a conta é criada normalmente (indicação é
atribuição de métrica, não controle de acesso a dado financeiro de terceiro — menor risco que o
convite de membro).

## Decisão 4 — Mensagens proativas vão só pro dono da conta

Insights e (indiretamente) o sweep de indicação tratam só o `owner` como destinatário/referência
de fuso — espelha a mesma simplificação da Fase 2 (conexão de agenda é por conta, não por
membro): WhatsApp não tem um conceito de "silenciar notificação só pra mim" por membro, então
mandar pra todo mundo arriscaria parecer spam pra quem não quer. Evolução futura: preferência de
notificação por membro.

## Decisão 5 — API pública: só leitura, chave por conta, sem write

`GET /api/v1/transactions` e `GET /api/v1/tasks`, autenticados por `Authorization: Bearer
<chave>` (hash SHA-256 armazenado, mesmo padrão de `magic-links.ts` — a chave em si nunca é
reversível, só comparável). Deliberadamente **sem endpoint de escrita**: toda escrita hoje passa
pela camada de validação/normalização do orquestrador (zod schema + `normalizeCategory()` +
`logToolCall`) — um POST público bypassaria isso e um integrador externo poderia gravar uma
transação com categoria livre, sem o mesmo tratamento, quebrando a consistência de dado que o
resto do produto garante. Se escrita via API virar necessidade real, ela deve rodar pela mesma
validação, não uma rota paralela — fica documentado como não implementado, não esquecido.

Webhooks: `transaction.created` e `task.completed` (os dois eventos mais claramente "algo
mudou no financeiro/tarefas" pra quem for integrar). Disparo assíncrono (fila BullMQ
`webhook-dispatch`, mesmo padrão de retry das outras filas), corpo assinado por HMAC-SHA256
(mesmo esquema do webhook inbound do WhatsApp Cloud API, `verify-signature`-style) com o segredo
gerado na criação da assinatura.

Chaves de API e assinaturas de webhook são criadas pelo dashboard (não uma tool do WhatsApp —
não faz sentido "configurar integração técnica" numa conversa). Isso expande o dashboard além de
"somente leitura" pela segunda vez (primeira foi a conexão OAuth do Google Agenda, Fase 2,
`docs/adr/0002-*.md`) — mesmo raciocínio: ação que não tem como existir só por conversa de
WhatsApp.

## Consequências

- 3 filas BullMQ novas (`insights-sweep`, `insights-generate`, `webhook-dispatch`) — motivo
  detalhado na nota de implementação de cada handler.
- `record_transaction` e `complete_task` passam a enfileirar um evento de webhook (best-effort,
  nunca bloqueia a resposta ao usuário nem falha a tool call se o dispatch falhar).
- Admin (`/admin`) ganha visibilidade mínima das novas filas/tabelas via `COUNTABLE_TABLES` — sem
  card dedicado nesta rodada (evolução futura, não um requisito desta ADR).
