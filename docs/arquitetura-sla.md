# Arquitetura — filas, concorrência e proteções reais

> **Reconciliado com o código real em 2026-10-17.** A versão anterior deste documento propunha
> SLAs numéricos e uma regra de serialização por usuário que não existem na implementação.
> Esta versão descreve o que de fato está em `apps/worker/src/worker.ts`,
> `packages/core/src/queues/definitions.ts` e `packages/core/src/security/*`/`context/*`.

## Filas reais (BullMQ) e concorrência configurada

| Fila | Handler | Concorrência | Retry |
|---|---|---|---|
| `incoming-message` | `handleIncomingMessage` | 5 workers em paralelo | 3 tentativas, backoff exponencial (5s, 10s, 20s) |
| `audio-transcription` | `handleAudioTranscription` | 3 workers em paralelo | idem |
| `reminder-dispatch` | `handleReminderDispatch` | 5 workers em paralelo | idem |

Não há fila nem job de resumo diário/semanal proativo — só essas três.

## Não existe serialização por usuário

Uma versão anterior deste documento afirmava que "nenhuma tool de escrita roda em paralelo para
o mesmo `user_id`" via fila/lock dedicado. **Isso não existe.** A fila `incoming-message` roda
com concorrência 5 sem particionamento por usuário — duas mensagens do mesmo número, enfileiradas
quase ao mesmo tempo (ex.: dois áudios em sequência), podem ser processadas por workers
diferentes em paralelo, cada um rodando `orchestrateTurn` de forma independente. Não há
teste nem proteção específica para esse cenário hoje.

O que **existe de fato** contra duplicação/corrida:

- **Idempotência por mensagem** (`context/reply-cache.ts`): antes de orquestrar, o handler
  verifica se já existe uma resposta cacheada para aquele `waMessageId` (TTL 24h). Isso protege
  contra o BullMQ reprocessar a **mesma** mensagem em um retry — não contra duas mensagens
  **diferentes** do mesmo usuário chegando em paralelo.
- **Rate limit por número** (`security/rate-limit.ts`): no máximo 20 mensagens por minuto por
  `whatsappNumber` (janela fixa via Redis `INCR`/`EXPIRE`), checado pelo webhook antes de
  enfileirar. Protege contra número comprometido/automação, não é um controle de concorrência
  de escrita.
- **Idempotência de disparo de lembrete** (`hasReminderBeenDispatched`): evita reenviar a
  notificação do mesmo lembrete se o envio já teve sucesso numa tentativa anterior e só a
  marcação de status seguinte falhou.

**Risco real conhecido, não mitigado:** dois áudios/mensagens de texto do mesmo usuário
processados em paralelo podem, em teoria, gerar duas chamadas de `record_transaction`
concorrentes sem nenhuma ordem garantida entre elas. Não é um caso coberto por teste nem por
proteção de código hoje — fica registrado aqui como risco conhecido, não como comportamento
seguro.

## Aviso de turno lento (o único "SLA" com comportamento de fallback real)

`INTERIM_NOTICE_MS = 8_000` em `packages/core/src/llm/providers/orchestration.ts`: se a
tentativa inteira (todos os providers de LLM configurados, na ordem de prioridade) não terminar
em 8s, uma mensagem (`MESSAGES.stillProcessing`) é enviada uma única vez, sem abortar o
processamento em curso. Ver teste em `providers/orchestration.test.ts`.

Não existem outros números de SLA (p50/p95 por tipo de interação) formalizados ou medidos no
código — uma versão anterior deste documento inventava uma tabela de latência-alvo que nunca
foi validada contra nada real. Se esses números forem necessários (ex.: para alertas de
observabilidade), são trabalho futuro, não algo já decidido.
