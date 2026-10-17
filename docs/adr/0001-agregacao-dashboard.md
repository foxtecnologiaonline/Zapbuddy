# ADR 0001 — Agregação de resumos financeiros (dashboard e WhatsApp)

**Status:** proposta, **não implementada** — ver nota de reconciliação abaixo.

## Nota de reconciliação (2026-10-17)

Esta ADR foi escrita sem visibilidade da implementação real, que já existia em outra
branch/sessão quando foi criada. O código real (`packages/db/src/repositories/transactions.ts`,
`summarizeTransactions()`) faz a agregação **on-the-fly** a cada chamada de
`get_financial_summary` — soma/agrupa em memória sobre o resultado de uma query filtrada por
usuário e período, com um teto de segurança de 2000 linhas (`MAX_TRANSACTIONS_PER_QUERY`), sem
tabela nem view materializada. Não existe `daily_summaries`, não existe atualização incremental
na escrita.

A decisão abaixo permanece registrada como **proposta não adotada** — pode valer a pena
revisitá-la se o volume de transações por usuário crescer a ponto do teto de 2000 linhas ou da
agregação em memória virar gargalo real, mas hoje (MVP, poucos usuários, períodos curtos de
`'today'`/`'last_7_days'`) a implementação simples é suficiente e é a que está em produção.

## Contexto (como escrito originalmente, mantido por histórico)

O roteiro do Tom (`docs/conversas-tom.md`, seção 2.7/2.8) e o dashboard web (seção 5) exibem
resumo diário, semanal e o histórico de transações. Sem uma decisão explícita, a implementação
tende a calcular `SUM`/`GROUP BY` direto em `transactions` a cada chamada — funciona bem com
poucos registros, mas degrada conforme o histórico do usuário cresce (meses de lançamentos),
e cada abertura do dashboard ou cada resumo diário proativo dispararia a mesma varredura.

## Decisão

Resumos (diário, semanal, por categoria) são **pré-agregados**, não calculados on-the-fly:

- Uma tabela/view materializada `daily_summaries` (`user_id`, `date`, `category`, `type`,
  `total`) é atualizada de forma incremental a cada `createTransaction`/`updateTransaction`
  bem-sucedida (mesma transação de escrita, ou job assíncrono de baixa latência logo após).
- `getDailySummary` e `getWeeklySummary` leem dessa tabela agregada, nunca da tabela bruta de
  transações.
- O dashboard web lê a mesma fonte agregada — não há duas implementações de agregação (uma
  pro WhatsApp, outra pro painel).

## Alternativas consideradas

1. **Calcular on-the-fly a cada leitura** — mais simples de implementar no início, mas não
   escala e viola o SLA de leitura definido em `docs/arquitetura-sla.md` (1s p50 / 2s p95)
   assim que o histórico crescer.
2. **View materializada com refresh agendado (ex.: a cada 15 min)** — mais simples que
   atualização incremental, mas o resumo diário proativo (disparado às 20h) poderia mostrar
   dado desatualizado se o refresh não tiver rodado a tempo.
3. **Agregação incremental na própria escrita (escolhida)** — cada `createTransaction` já
   atualiza a linha agregada correspondente na mesma operação lógica; leitura é sempre O(1) por
   período, sem risco de dado desatualizado.

## Consequências

- Toda tool de escrita financeira (`createTransaction`, `updateTransaction`) passa a ter uma
  segunda responsabilidade: manter `daily_summaries` consistente. Isso precisa ser coberto por
  teste (criar transação → agregado reflete o novo total).
- Correção de lançamento (caso 2.6 do roteiro) também atualiza o agregado do dia afetado, não
  só o registro bruto.
- Categoria usada na agregação depende da taxonomia fechada de
  `docs/categorias-financeiras.md` — categoria livre quebraria o agrupamento.
