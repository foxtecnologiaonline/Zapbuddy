# Taxonomia de categorias financeiras

> **Reconciliado com o código real em 2026-10-17.** Esta versão substitui a anterior, que foi
> escrita sem visibilidade de `packages/core/src/llm/categories.ts` e inventou uma lista
> diferente da implementada. A fonte de verdade é sempre o código — este documento só o
> descreve.

## Lista canônica (`packages/core/src/llm/categories.ts`)

| Tipo | Categorias |
|---|---|
| Despesa (`EXPENSE_CATEGORIES`) | `alimentacao`, `transporte`, `moradia`, `saude`, `lazer`, `fornecedores`, `impostos`, `educacao`, `outros` |
| Receita (`INCOME_CATEGORIES`) | `venda`, `servico_prestado`, `salario`, `outros` |

## Como a normalização funciona de fato

A IA nunca tem a categoria rejeitada por validação — o comportamento real é **soft-match com
fallback silencioso**, não um enum fechado que recusa valor fora da lista (diferente do que uma
versão anterior deste documento descrevia):

1. `record_transaction` aceita `category` como `z.string().min(1)` — qualquer string não vazia.
2. `normalizeCategory()` remove acentos e caixa (`"Saúde"` → `"saude"`) e compara contra a lista
   canônica.
3. Se bater, grava a categoria canônica. Se não bater com nada, grava `'outros'` — nunca falha
   a chamada por categoria desconhecida.
4. O retorno da tool inclui `category_fallback: boolean` (`true` quando a categoria crua do
   modelo não casou com nenhuma canônica) — é esse campo, visível no `tool_call_log`, que serve
   de sinal de auditoria de precisão de categorização, não um bloqueio de escrita.

Isso é uma escolha de design deliberada: um erro de categorização nunca deve aparecer pro
usuário como falha técnica numa conversa que deveria soar natural (ver comentário em
`system-prompt.ts`). A pergunta ao usuário sobre categoria incerta (ver `docs/conversas-tom.md`)
é uma decisão do **system prompt** sobre quando vale a pena perguntar antes de chamar a tool —
não uma validação que a tool imponha.

## Observação sobre o fuso/janela de resumo

`get_financial_summary` só aceita `period: 'today' | 'last_7_days'` — não existe resumo mensal
nem `from`/`to` livres. "Últimos 7 dias" é uma janela rolante (hoje + 6 dias anteriores) no fuso
do usuário, não "semana de calendário" (domingo–sábado). Ver `packages/core/src/time/zoned-ranges.ts`.
