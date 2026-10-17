# Escopo de implementação — melhorias identificadas na revisão

Este documento detalha o escopo de implementação das 10 sugestões levantadas na revisão do
roteiro do Tom (`docs/conversas-tom.md`) e do `CLAUDE.md`. Como o repositório ainda não tem
código de aplicação, todo entregável aqui é **documentação/decisão de arquitetura** — vira
input direto para quando o código (orquestrador LLM, tools, schema do banco) começar a ser
escrito. Nenhum item aqui adiciona escopo de produto fora do MVP travado.

Convenção de esforço: **XS** (< 30 min), **S** (até 2h), **M** (meio dia), **L** (1+ dia).

---

## 1. Corrigir horários inconsistentes no exemplo 2.6

- **Problema:** cenário de lançamento duplicado mostra almoço às 19:40 (hora incompatível).
- **Entregável:** correção pontual no texto do exemplo.
- **Arquivo:** `docs/conversas-tom.md` (seção 2.6).
- **Critério de aceite:** horários dos dois lançamentos de exemplo plausíveis para almoço
  (ex.: 12:10 e 13:35).
- **Esforço:** XS.
- **Depende de:** nada.

## 2. Fixar taxonomia de categorias financeiras

- **Problema:** categorias hoje são string livre por exemplo, sem lista fechada — quebra
  agregação em resumo/dashboard assim que a IA variar grafia.
- **Entregável:** arquivo com enum fechado de categorias MVP (despesa e receita separados),
  cada uma com: nome canônico, aliases aceitos, exemplos de gatilho.
- **Arquivo (novo):** `docs/categorias-financeiras.md`.
- **Critério de aceite:** toda categoria usada em `docs/conversas-tom.md` existe nessa lista;
  lista cobre os segmentos do MVP (autônomo/MEI: alimentação, mercado, transporte, moradia,
  utilidades/telecom, impostos, serviços de terceiros, serviços prestados, outras receitas,
  outros).
- **Esforço:** S.
- **Depende de:** nada — mas é pré-requisito dos itens 7 e 8.

## 3. Definir SLA de latência por tipo de interação

- **Problema:** fila BullMQ existe na arquitetura, mas nenhum número de latência aceitável
  está documentado — impossível dimensionar workers ou alertar regressão.
- **Entregável:** tabela de SLA por tipo de operação (texto síncrono, áudio assíncrono,
  resumo/leitura, lembrete disparado) com alvo e p95.
- **Arquivo (novo):** `docs/arquitetura-sla.md` (ou seção dedicada em `CLAUDE.md` se preferir
  manter tudo centralizado — a decidir com o usuário).
- **Critério de aceite:** todo tipo de interação do roteiro do Tom tem um número de latência
  associado, usável depois como alerta de monitoramento.
- **Esforço:** S.
- **Depende de:** nada.

## 4. Regra de fallback "ainda processando" para áudio

- **Problema:** cenário 2.3 só tem duas mensagens (recebido → confirmado); sem fallback se a
  fila atrasar, o usuário não sabe se o sistema travou.
- **Entregável:** nova regra transversal + exemplo de cenário (áudio demorando além do SLA).
- **Arquivo:** `docs/conversas-tom.md` (novo caso em seção 2, nova regra na seção 7).
- **Critério de aceite:** regra explícita: se o job de transcrição não concluir dentro do SLA
  definido no item 3, Tom envia mensagem intermediária antes da confirmação final.
- **Esforço:** XS.
- **Depende de:** item 3 (usa o número de SLA definido lá).

## 5. Nota de sintaxe WhatsApp vs. markdown do documento

- **Problema:** respostas de exemplo usam `**negrito**` (markdown), mas o WhatsApp usa
  `*negrito*` — risco de implementação copiar a sintaxe errada.
- **Entregável:** nota de convenção no topo do documento.
- **Arquivo:** `docs/conversas-tom.md` (bloco de convenções, início do arquivo).
- **Critério de aceite:** frase explícita avisando que `**texto**` é só negrito do markdown
  deste documento, e que a implementação real deve usar `*texto*` (sintaxe nativa do
  WhatsApp).
- **Esforço:** XS.
- **Depende de:** nada.

## 6. Documentar validação de schema antes de toda tool call de escrita

- **Problema:** a regra "nunca inventar valor/categoria" depende do comportamento do LLM, sem
  uma camada de validação declarada que barre a execução se faltar campo obrigatório.
- **Entregável:** seção de arquitetura descrevendo contrato de cada tool (schema de input,
  validação antes da execução, o que acontece quando a validação falha — nunca grava, nunca
  confirma).
- **Arquivo (novo):** `docs/tools-contrato.md`, cobrindo pelo menos `createTransaction`,
  `createTask`, `createReminder`, `updateTransaction`, `updateTask`, `updateReminder` citadas
  no roteiro.
- **Critério de aceite:** cada tool tem lista de campos obrigatórios/opcionais e o
  comportamento de erro documentado, consistente com a regra 1 do roteiro do Tom.
- **Esforço:** M.
- **Depende de:** item 2 (categoria é um dos campos validados).

## 7. Extrair few-shots de categorização para arquivo consumível pelo prompt

- **Problema:** os pares "mensagem → categoria" do roteiro só existem como prosa; não dá pra
  reusar como few-shot no system prompt sem recopiar manualmente.
- **Entregável:** arquivo JSON com os pares mensagem/categoria/confiança extraídos dos
  cenários do roteiro, pronto para ser injetado no prompt do orquestrador.
- **Arquivo (novo):** `prompts/few-shot-categorizacao.json`.
- **Critério de aceite:** todo exemplo de categorização do roteiro do Tom (seções 2.1, 2.2,
  2.4, 2.5) tem uma entrada correspondente no JSON, usando as categorias canônicas do item 2.
- **Esforço:** S.
- **Depende de:** item 2.

## 8. Decidir estratégia de agregação para o dashboard

- **Problema:** seção 5 do roteiro (dashboard) não define se resumo diário/semanal é
  calculado on-the-fly ou pré-agregado — risco de gargalo com histórico longo de transações.
- **Entregável:** decisão de arquitetura registrada (ADR curto): pré-agregação via view
  materializada ou job agendado, não cálculo on-the-fly a cada carregamento do painel.
- **Arquivo (novo):** `docs/adr/0001-agregacao-dashboard.md`.
- **Critério de aceite:** decisão registrada com alternativas consideradas e trade-off,
  seguindo convenção de ADR (contexto, decisão, consequências).
- **Esforço:** S.
- **Depende de:** item 2 (agregação é por categoria).

## 9. Regra de concorrência por usuário (fila/lock)

- **Problema:** nenhuma regra cobre dois áudios em sequência ou uma correção (2.6) chegando
  antes do lançamento anterior terminar de persistir — risco de corrida.
- **Entregável:** nova regra transversal + nota de arquitetura: mensagens do mesmo `user_id`
  são processadas em ordem (fila por usuário ou lock otimista), nunca em paralelo.
- **Arquivo:** `docs/conversas-tom.md` (nova regra na seção 7) + referência em
  `docs/arquitetura-sla.md` (item 3) ou seção própria.
- **Critério de aceite:** regra explícita de serialização por usuário documentada e
  referenciada nos cenários de áudio (2.3) e correção (2.6).
- **Esforço:** XS.
- **Depende de:** item 3 (mesmo documento de arquitetura).

## 10. Especificar esquema da tabela de log de tool calls

- **Problema:** regra 4 do roteiro ("logar toda tool call") não define onde nem com que
  estrutura — sem isso não vira insumo real de debug de interpretação de linguagem natural.
- **Entregável:** definição de schema da tabela de log (colunas, tipos, índice mínimo).
- **Arquivo (novo):** `docs/schema-logs.md`, com a tabela:
  `tool_call_logs(id, user_id, tool_name, params jsonb, result jsonb, confidence numeric,
  latency_ms integer, created_at timestamptz)`.
- **Critério de aceite:** schema documentado, com índice sugerido em `(user_id, created_at)`
  para consulta de depuração por usuário/período.
- **Esforço:** S.
- **Depende de:** nada.

---

## Sequenciamento recomendado

**Onda 1 — correções e notas pontuais, sem dependência (≈1h total):** itens 1, 5, 3, 10, 9.
Rápidas e desbloqueiam o resto.

**Onda 2 — fundação de conhecimento (≈2–3h):** item 2 (taxonomia de categorias). Bloqueia os
itens 6, 7 e 8.

**Onda 3 — depende da taxonomia (≈1 dia):** itens 6, 7, 8, nessa ordem (6 e 7 podem ser
paralelos entre si).

**Onda 4 — comportamento dependente de SLA (≈30 min):** item 4, após o item 3 estar pronto.

**Esforço total estimado:** ~1,5–2 dias de trabalho de documentação/decisão, antes de
qualquer linha de código de aplicação.
