# ADR 0011 — Curadoria das interações (2026-11)

**Status:** camada 1 implementada; camadas 2 (A, B, C) são **proposta, aguardando decisão do dono do produto**.

## Contexto — o que existia e o que faltava

Pedido do dono do produto: criar uma curadoria sobre a interação dos usuários (perguntas, respostas e feedback das
interações), com sugestão de como criar e como exercer.

O que o produto já tinha:

- **Loop de feedback semanal** (`interpretation-feedback`, tabela `interpretation_insights`): conta falhas de tool por
  semana. É um relatório; não tem fila, não tem revisão humana e não registra nenhuma decisão.
- **`tool_call_logs`**: toda tool call com parâmetros e resultado (90 dias). É o que dá para curar hoje.
- **Sinais implícitos já gravados** nesses logs: a pessoa desfez (`undo_last_action`), corrigiu logo depois de criar
  (`correct_last_transaction`, `update_*`), a categoria caiu em fallback (`category_fallback`), a tool falhou.

O que **não** existia, e limita a curadoria:

1. **O texto das conversas não é guardado em Postgres.** Vive no Redis (40 turnos, 24h de inatividade); só sobra o
   resumo rolante processado. Logo, **perguntas das pessoas e respostas do Tom não podem ser curadas retroativamente**.
2. **Nenhum canal de feedback.** Reação do usuário (👍/👎) chega como evento `other` e é descartada.
3. **Nenhum lugar para registrar a decisão** de quem revisou, então o aprendizado se perde.

## Decisão

### Camada 1 — fila de curadoria sobre sinais implícitos (implementada)

`/admin/curadoria` (atrás do login do admin). Nenhum dado novo de usuário é coletado: só reorganiza
`tool_call_logs` numa fila priorizada e guarda o veredito de quem revisou.

| Prioridade | Sinal | O que significa |
|---|---|---|
| 1 | `undone` | A pessoa desfez a última ação: viu o resultado e não quis. Sinal mais forte. |
| 2 | `failed` | A tool falhou (validação, regra, bug). |
| 3 | `corrected` | Edição até 10 min depois de criar: o Tom provavelmente entendeu errado. |
| 4 | `category_fallback` | O modelo usou categoria que não existe; caiu em "outros". |

- **Veredito** de cada caso: `acertou` (o sinal enganou), `ruido` (sem ação) ou `errou` + **destino** obrigatório:
  `prompt`, `categoria`, `bug` ou `exemplo` (virar caso de teste). O destino define a ação, não só o rótulo.
- **Métrica de norte:** *sinais por 100 chamadas da IA*. É o número para comparar antes e depois de mudar prompt ou regra.
- **Migration `0030_curation_reviews.sql`** (precisa ser aplicada; sem ela a fila funciona e a página avisa que não dá
  para salvar veredito). Sem FK para `tool_call_logs`, porque os logs são apagados em 90 dias e a revisão precisa
  sobreviver; por isso guarda um `snapshot` do caso.
- **Privacidade:** o caso é reconstruído **no servidor** a partir do log (o formulário só manda o id e o veredito); o
  `snapshot` e a nota saem com CPF, CNPJ, e-mail, cartão e telefone mascarados (`redactSensitive`); toda revisão fica
  na auditoria do admin (`curation_reviewed`); exportação CSV só para o admin.
- **Limite honesto:** isto cura as **interpretações** (o que o Tom entendeu e executou), não as frases das pessoas
  nem as respostas do Tom. Conversa que não passa por tool (pergunta geral, "o que você faz?") é invisível aqui.

### Camada 2 — o que falta para curar perguntas, respostas e feedback (proposta, **não implementada**)

Cada item muda o que o produto guarda sobre as pessoas. Por isso é decisão do dono do produto, não de uma sessão.

**A. Feedback explícito leve.** Usar a **reação do usuário** (👍/👎) à mensagem do Tom como sinal passivo, sem pedir
nada. Exige guardar o id (`wamid`) de cada mensagem enviada e ligá-lo à tool call/resposta. Alternativa mais invasiva,
**não recomendada**: perguntar "isso ajudou?" por amostragem. Cansa, e a pessoa está no WhatsApp para resolver a vida.

**B. Captura do texto, com consentimento e minimização.** Tabela de amostras de interação (pergunta, resposta, tools
chamadas), com:
- amostragem (ex.: 5%) **mais** 100% dos casos que disparam sinal da camada 1;
- texto mascarado antes de gravar (mesma `redactSensitive`, estendida a nomes de contato e chave PIX);
- retenção curta (ex.: 30 dias) e acesso só do admin;
- aviso na abertura do onboarding / política de privacidade e **opt-out por conversa** ("não guarde minhas conversas");
- **parecer jurídico antes** (LGPD): conversa pessoal pode trazer dado sensível (saúde, por exemplo), e a base legal
  precisa estar definida. Sem B, curar "perguntas e respostas" não é possível.

**C. Biblioteca curada (a saída da curadoria).** É para onde os vereditos `exemplo` e `prompt` escoam:
1. **Golden set** de 100–200 casos *sintéticos* (mensagem → tool e argumentos esperados), rodado como eval antes de
   qualquer mudança de prompt. Isto fecha o buraco de "o projeto não tem eval": hoje toda mudança de prompt é
   validada só por teste de texto.
2. **Respostas-modelo** para as perguntas mais frequentes (o que você faz, como desfaz, o que acontece com meus dados).
3. **Taxonomia viva** de categorias e aliases (`categories.ts` + `docs/categorias-financeiras.md`).
4. **Few-shot** a partir dos casos aprovados.

## Como exercer a curadoria

**Papéis.** *Curador*: dá o veredito (hoje, o dono do produto). *Mantenedor*: transforma veredito em mudança, via PR. Com
duas pessoas, revisão cruzada de ~10% dos vereditos para medir concordância.

**Cadência.**
- **Semanal, ~30 min:** os mais urgentes primeiro (desfeito → falha → corrigido → categoria). Para cada caso, só duas
  perguntas: *o Tom errou ou o sinal enganou? Se errou, para onde vai?*
- **Urgentes** (`undone` e `failed`): em até 48 h.
- **Mensal:** tendência de *sinais por 100 chamadas* (geral e por tool), poda do golden set, revisão de categorias.

**Critérios do veredito** (para dois curadores darem a mesma resposta):
- `errou`: o resultado não é o que uma pessoa razoável quis (valor, data, categoria, tipo de registro errados).
- `acertou`: o Tom fez o pedido; a pessoa mudou de ideia ou o sinal foi coincidência.
- `ruido`: não dá para julgar ou não há ação possível (ex.: erro de rede, edição por motivo alheio ao Tom).

**Do veredito à ação:**

| Destino | Ação | Como fecha |
|---|---|---|
| `prompt` | PR em `system-prompt.ts`/`tom-persona.ts` | teste de prompt + nota no CLAUDE.md |
| `categoria` | categoria ou alias novo | `categories.ts` + doc + teste |
| `bug` | correção na tool | teste de regressão |
| `exemplo` | caso **sintético** no golden set | nunca o texto real da pessoa |

**Regras de operação.**
- **Regra do 3:** o mesmo padrão em 3 casos vira mudança de prompt, categoria ou bug; caso isolado vira, no máximo, um exemplo.
- **Uma mudança por vez** e espera de ~2 semanas medindo *sinais por 100 chamadas*; se não caiu, a mudança não resolveu.
- **Teto de fila:** passou de ~50 pendentes, triar só `undone` e `failed` até zerar.
- **Nunca** copiar texto real de pessoa para nota, teste ou exemplo: reescrever de forma sintética.

**Saúde do processo** (olhar todo mês):
- *Sinais por 100 chamadas* (norte): deve cair com o tempo.
- *% de casos pendentes há mais de 7 dias*: se cresce, a curadoria está virando relatório que ninguém lê.
- *% de `ruido`*: acima de ~50%, o sinal está mal calibrado (ex.: ajustar a janela de 10 min do `corrected`).

## Consequências

- Passa a existir, pela primeira vez, um registro do que foi decidido sobre cada interpretação errada.
- O sinal `corrected` mistura "o Tom entendeu errado" com "a pessoa mudou de ideia"; o veredito `ruido` existe para isso.
  Com poucos usuários, a fila é pequena e os percentuais oscilam muito: ler junto com o tamanho da amostra.
- Sem a camada 2B, **perguntas e respostas** continuam fora do alcance. É a próxima decisão a tomar, e depende de
  consentimento e parecer jurídico, não de código.
- Ordem sugerida: aplicar a `0030` e rodar a camada 1 por 2–3 semanas → decidir A e B com o que a fila mostrar →
  montar o golden set (C) a partir dos casos `exemplo`.
