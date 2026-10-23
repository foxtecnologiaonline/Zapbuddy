# ADR 0006 — Alcance do Tom: edição, hábitos, pesquisa ampliada, busca semântica e leitura de arquivos

Data: 2026-10 · Status: implementado · Decisão do dono do produto (pedido explícito: implementar as 6 lacunas
levantadas no mapeamento de alcance de pesquisa e execução).

## Contexto

O mapeamento de alcance mostrou seis lacunas: (1) o Tom guardava foto/PDF sem ler o conteúdo; (2) busca em notas era
só substring e em documentos só nome/legenda; (3) hábitos/rotina tinham sido cortados da rodada B2C; (4) agenda só
criava e listava (e `last_7_days` olhava só pra trás); (5) tarefa, lembrete e nota só criavam e apagavam — remarcar
exigia apagar e recriar; (6) `web_search` era só dúvida geral/categorização, sem noção de "informação do dia".
Um achado extra: não existia `list_reminders`, então `cancel_reminder` nunca tinha como descobrir um `reminder_id`
numa conversa nova (o histórico curto guarda só texto).

## Decisões

### 1. Edição (`update_task`, `update_note`, `update_reminder`, `update_calendar_event`, `delete_calendar_event`, `list_reminders`)
- Edição é PATCH por id, nunca apagar-e-recriar (perderia id/histórico e duplicaria aviso).
- `update_reminder` remarca o job atrasado do BullMQ com o mesmo `jobId` (`reminder.id`, o mesmo que `cancel_reminder`
  usa). `reminder-dispatch` ganhou um guard: job velho que chega mais de 60s antes do `remind_at` atual é descartado.
  Só lembrete `pending` é editável.
- Agenda: horário só em par (início+fim), pra não montar intervalo invertido. O conflito de agenda ignora o próprio
  evento. `delete_calendar_event` não entra no `undo_last_action` (apagar evento externo não é recriável com o mesmo id).
- `list_calendar_events` ganhou `tomorrow`, `next_7_days` e `from_date`/`to_date` (datas locais). `last_7_days` continua
  sendo só passado.

### 2. Hábitos (migration 0025, renumerada da 0023 por colisão com a do trial)
- `habits` + `habit_checkins`; `checkin_date` é a DATA LOCAL da pessoa, com `unique(habit_id, checkin_date)` (check-in
  idempotente). Sequência calculada em código puro (`habits/streak.ts`), nunca estimada pelo modelo.
- Hoje sem marcar não quebra a sequência que vinha até ontem. Retroativo até 7 dias, nunca futuro.
- Sem prompt periódico de check-in nesta rodada (cobrança ativa de hábito é decisão de produto separada); entra no
  resumo semanal, no export e no dashboard.

### 3. Pesquisa ampliada
- `web_search` ganhou `reason: current_info`: índice de notícias da Tavily (últimos 3 dias), cache de 20 min (vs. 7
  dias do geral) e data de publicação no resumo.
- `get_weather`: previsão de até 5 dias de qualquer cidade do Brasil (geocoding BR fixo) ou da região do DDD, com o
  mesmo OpenWeatherMap do resumo matinal. Sem chave/falha → status explícito, o Tom diz que não conseguiu checar.
- `get_market_rate`: dólar/euro/libra/Selic/CDI/IPCA direto do SGS do Banco Central — fonte primária, pública, sem
  chave e sem restrição de uso comercial (a mesma preocupação que descartou o Open-Meteo). Câmbio é a taxa de venda do
  dia de referência, não cotação ao vivo; o `reference_date` vai junto. Cripto/ação ficam no `web_search`.
- Fora: trânsito/rota (sem fonte gratuita confiável).

### 4. Busca semântica em notas e documentos (migration 0024)
- Reaproveita pgvector + `text-embedding-3-small` da base de conhecimento. Busca **híbrida**: texto exato é a fonte de
  verdade (`match: "exact"`), parecidos por significado entram marcados `related` (cosseno ≥ 0.30, máx. 5) para o Tom
  não apresentar palpite como achado.
- Vetor é bônus: sem `OPENAI_API_KEY` a nota/arquivo é salva igual e a busca por texto continua. Backfill horário no
  sweep do worker (25 notas + 25 documentos por passada) completa o que ficou sem.
- Repos usam colunas explícitas (nunca `select('*')`) para o vetor não vazar para o dashboard, o export e o contexto do
  LLM.

### 5. Leitura de comprovante/conta/foto (migration 0024)
- Fluxo: upload (mecânico, como antes) → uma chamada de visão SEM tools devolve campos estruturados (tipo,
  estabelecimento, valor em centavos, datas, resumo) → grava em `documents.extracted_*` (entra na busca) → o
  orquestrador normal responde, recebendo a leitura como TEXTO marcado como dado extraído. Assim o fallback OpenAI e o
  histórico curto (só texto) não precisaram mudar.
- **Nunca registra gasto sozinho a partir do arquivo**: comprovante com valor → o Tom pergunta; só chama
  `record_transaction` direto se a legenda da pessoa já pedir. Valor/data nunca são completados por suposição.
- Defesas: o extrator é instruído a não transcrever CPF/RG/CNH/cartão/PIX/linha digitável; o texto lido é saneado
  (sem quebra de linha, tamanho máximo) e tratado como dado, nunca instrução (prompt injection por imagem).
- Limites: imagem jpeg/png/gif/webp até ~3,7 MB (teto de 5 MB da API depois do base64), PDF até 10 MB. Fallback OpenAI só
  para imagem. Fora do limite/tipo (docx, heic, vídeo) → continua só guardado.
- Toda a camada de leitura é best-effort: qualquer falha cai na confirmação fixa "Salvei ...", e **não propaga erro** (um
  retry do BullMQ duplicaria o upload). Resposta é cacheada por `waMessageId` (reentrega só reenvia).
- Quem não terminou o onboarding tem o arquivo lido e buscável, mas a conversa não é desviada.
- Arquivos anteriores a esta rodada **não** são relidos retroativamente (custo de visão); ficam com busca por
  nome/legenda e vetor só desses campos.

## Consequências
- 12 tools novas (43 → 55 no registro): o schema serializado passa de ~18KB para ~28,5KB (~7,1K tokens estimados,
  chars/4) — ainda abaixo do patamar de ~10K onde `tool_search`/`defer_loading` compensa, mas já perto. Próxima rodada
  que adicionar tools deve remedir e avaliar `defer_loading` antes.
- Migrations `0025` (hábitos) e `0024` precisam ser aplicadas no Supabase antes do deploy.
- Duas chamadas de LLM por arquivo legível (visão + resposta). Acompanhar custo pelos logs `llm_call_completed`.
