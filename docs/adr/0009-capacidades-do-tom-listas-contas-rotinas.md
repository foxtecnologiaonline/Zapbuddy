# ADR 0009 — Capacidades do Tom: balões, listas, contas exatas, parcelas, dia, rotinas e comandos diretos

Status: implementado em 2026-10 (pedido do dono do produto: sugestões 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 e 15
de uma lista de 16; ficaram de fora a 2 — resposta em áudio — e a 16 — atalhos de captura rápida).

## Contexto

O Tom já cobria agenda, tarefas, notas, financeiro, hábitos e pesquisa, mas (a) conversava só em mensagem única e
reativa, (b) esquecia a conversa depois de 24h, (c) não tinha listas, conta exata nem parcelamento, (d) só falava
sozinho no resumo da manhã e (e) toda ação, por mais simples que fosse, passava pelo LLM. Ao mesmo tempo o schema de
tools estava no limite: 62 tools, ~8,1 mil tokens, contra o patamar de ~10 mil do CLAUDE.md.

## Decisões

**Orçamento de tools primeiro.** Poucas tools, cada uma com várias ações, e atalhos que nem usam tool:
- 5 tools novas, todas com `action`/`operation`: `manage_list`, `calculate`, `manage_installments`, `time_utils`,
  `get_day_overview`. Sem elas seriam ~20 tools.
- As 62 descrições existentes foram enxugadas (mesma semântica, menos repetição do que o system prompt já diz).
  Resultado: **67 tools, ~27,5 mil caracteres ≈ 6,9 mil tokens** (antes: 62 tools, 8,1 mil). O teste
  `tool-registry.budget.test.ts` trava o orçamento (7,4 mil tokens no padrão, 8,2 mil com painel e cobrança ligados) e
  o tamanho de cada descrição — capacidade nova entra como ação de tool existente ou não entra gorda.
- `tool_search`/`defer_loading` (sugestão do CLAUDE.md pra >10 mil tokens) **não foi implementado**: o schema agora
  está bem abaixo do patamar, e não dá pra validar o recurso sem a chave de produção.

**Comandos diretos (#13).** `commands/parse.ts` casa só MENSAGEM INTEIRA e exata (depois de normalizar acento, caixa
e pontuação): `hoje`, `amanhã`, `semana`, `tarefas`, `gastos`, `listas`, `lista de <nome>`, `desfazer`, `ajuda`,
`ajuda <assunto>`, `dica`, `foco [N]`, `fechamento do dia`, `revisão da semana`, ligar/desligar resumo, dicas,
fechamento, revisão e check-ins. "hoje gastei 30 no almoço" não é comando — vai pro LLM. Roda em `orchestrateTurn`
depois do onboarding e antes de qualquer busca de contexto; resposta instantânea, zero token, mesma saída que o LLM
daria (lê do banco, nunca inventa). Comando que não consegue resolver (`lista de presentes` sem essa lista) ou que
falha devolve `null`/erro e a mensagem segue pro LLM normalmente. Se a última fala do Tom foi uma pergunta, o roteador
não roda: "amanhã" respondendo "pra quando você quer o lembrete?" é a resposta, não o atalho de agenda. "O que você faz?" continua sendo conversa (regra
anterior: frase corrida, nunca bula) e fecha apontando pro `ajuda`.

**Balões, digitando… e reação (#1, #3).** Linha em branco na resposta = novo balão (máx. 3; o excedente se junta ao
último). Entre balões: "digitando…" (Cloud API: status `read` com `typing_indicator`; Evolution: `sendPresence`, melhor
esforço) e pausa de 0,7–2,2s proporcional ao tamanho. Falha no 1º balão propaga (o retry da fila reenvia tudo); falha
depois nunca propaga (duplicaria) — tenta o resto num balão só e registra. Agradecimento puro (`valeu`, `obrigado`,
`🙏`) vira reação ❤️ (Cloud API `type: reaction`) com texto curto de reserva se a reação falhar; **só agradecimento**
— `ok`/`blz`/`👍` podem ser o "sim" a uma pergunta — e **nunca** se a última fala do Tom foi uma pergunta. O cache de
idempotência guarda um envelope `{v:1,text,reaction}` (texto simples antigo continua válido).

**Memória longa da conversa (#4) e estilo (#5).** Resumo rolante em `conversation_summaries` (Postgres; sem Redis
novo): a cada 16 turnos ainda não cobertos (≈ 8 trocas), DEPOIS da resposta enviada, um LLM pequeno (Haiku; fallback
OpenAI) funde o resumo anterior com as falas novas (máx. 1.200 caracteres, sem dado sensível, falas tratadas como
dado). Entra na camada semi-estável do prompt (cacheável) marcado como DADO. Estilo (porte, formalidade, emoji) é
heurística pura sobre as últimas mensagens da pessoa, na camada volátil, só a partir de 4 mensagens. Falha em qualquer
um dos dois nunca impede a resposta.

**Listas (#7), contas exatas (#8), parcelas (#9), dia (#10), utilidades e foco (#12).**
- Listas: `lists`/`list_items`; itens casam por texto sem acento e com plural simples; ambíguo devolve as opções,
  nunca chuta. Diferente de tarefa (prazo) e nota (texto solto).
- `calculate`: avaliador recursivo sem `eval` (`+ - * / ^ ( ) %`, "1200 + 8%" = 8% *de* 1200); racha de conta em
  centavos (sobra nas primeiras pessoas, soma exata), parcelamento sem juros e com Price, variação percentual, juros
  compostos **só como simulação com a taxa que a pessoa deu**. O prompt proíbe aritmética de cabeça.
- `manage_installments`: guarda só o que a pessoa informou; **não lança gasto** (pergunta se quer registrar); dia 31
  em mês curto cai no último dia; "pagas" = parcelas com data anterior a hoje (a pessoa não marca pagamento);
  `commitments` soma parcelas + contas recorrentes por mês.
- `get_day_overview` e os atalhos `hoje/amanhã/semana`: agenda (com fim), tarefas, lembretes, atrasadas, sem data,
  hábitos sem marcar e **horários livres** na janela acordada (fim → início do silêncio; padrão 7h–22h). Fonte que
  falhou é avisada — nunca "dia livre" sem ter conseguido olhar.
- `time_utils`: hora em ~100 lugares (tabela fechada; desconhecido = "não sei", nunca chute), dias até uma data,
  próximo feriado **nacional** (estadual/municipal sem dado confiável de cidade ficam de fora), e foco/pomodoro, que
  vira um lembrete comum (mesma fila e mesmo cancelamento).

**Rotinas proativas (#6, #11, #15)** — dentro do sweep horário existente, sem fila nova (incidente de cota do Redis):
- *Check-in "como foi?"* (ligado; `routine_checkins`): 30min–4h depois de um compromisso criado pelo Tom (lido do
  `tool_call_logs`, aplicando edições/exclusões — sem chamar a agenda de ninguém toda hora) ou de uma tarefa com hora
  ainda pendente. 8h–20h, fora do silêncio, no máximo 2 por dia, uma vez por item. Tarefa perguntada é marcada
  (`follow_up_asked_at`) pra o resumo da manhã não repetir a pergunta. **Limitação:** evento criado fora do Tom
  (direto no Google/Outlook) não gera check-in.
- *Fechamento do dia* (20h) e *revisão da semana* (domingo 18h) — **opt-in** (`routine_day_close`/`routine_week_review`
  desligados por padrão): mais insistente que o resto, então só com o sim da pessoa. Ligam por comando ou conversa.
- *Dica semanal de habilidade* (ligada; quarta 11h, ≥3 dias de uso, ≤1 a cada 6 dias): a primeira habilidade do
  catálogo (`commands/skills.ts`, fonte única do `ajuda`) que a pessoa ainda não usou (por `tool_call_logs`) e que não
  foi mandada. Nunca repete; acabaram as habilidades, não manda nada.
- Idempotência por `proactive_message_logs` (o INSERT é a trava; unique `account_id, kind, ref`): reservar antes de
  enviar troca "pode perder um aviso se o envio falhar" por "nunca manda duas vezes". Toda mensagem proativa também é
  anexada ao histórico da conversa, pra um "sim"/"remarca" da pessoa fazer sentido.

## Regras mantidas

Sem painel, preço ou teste grátis em nenhum texto novo (o teste do catálogo de ajuda garante); no máximo 1 emoji por
linha (idem, também nos formatadores novos); nada de dado inventado — tudo que os comandos e as rotinas mostram vem
do banco/da agenda, com aviso quando uma fonte falha; piada continua só sob pedido.

## Operação

- **Migration `0028_tom_capabilities.sql` precisa ser aplicada no Supabase ANTES do deploy**: o sweep horário passou
  a selecionar `routine_*` de `users`. Idempotente.
- Nenhuma variável de ambiente nova. Reação e "digitando…" dependem do canal (Cloud API completo; Evolution só
  "digitando…", reação cai no texto curto).
- Não validado com usuários reais: observar (1) se a quebra em balões fica natural ou picotada, (2) quantos
  check-ins viram resposta vs. silêncio, (3) se o resumo da conversa mantém o que importa e não carrega ruído.

## Adendo (2026-10-29): indicadores econômicos no bom dia

Pedido do dono do produto depois de ver o resumo em produção. Detalhe na seção "Indicadores econômicos no bom dia" do CLAUDE.md.
Escolhas: oferta **uma vez** e opt-in (a pessoa escolhe quais), reaproveitando `set_morning_digest_preferences` em vez de uma tool nova (orçamento
de tools: o schema segue abaixo de 7,4 mil tokens, travado pelo teste), mensagem separada no fim do resumo e dados só do Banco Central.
