# Arquitetura — SLA de latência e concorrência por usuário

Referência para dimensionar workers da fila (BullMQ) e para alertas de monitoramento. Todo
tipo de interação do roteiro do Tom (`docs/conversas-tom.md`) tem um alvo de latência abaixo.
Sem esses números, não dá pra saber se uma resposta "demorada" é regressão ou comportamento
esperado.

## Tabela de SLA por tipo de interação

| Interação | Alvo (p50) | Limite (p95) | Observação |
|---|---|---|---|
| Mensagem de texto (gasto/receita/tarefa/lembrete simples) | 2s | 3s | síncrono, direto no handler do webhook, sem fila |
| Áudio (transcrição + categorização) | 8s | 15s | assíncrono via fila BullMQ (`transcribe-audio`); acima do p95, vale a regra de fallback (ver item 4 abaixo) |
| Resumo diário/semanal (leitura agregada) | 1s | 2s | depende de pré-agregação — ver `docs/adr/0001-agregacao-dashboard.md` |
| Lembrete disparado (job agendado) | — | até 1 min de atraso do horário configurado | tolerância do scheduler, não da resposta do Tom |
| Dashboard web (carregamento inicial) | 1.5s TTFB | 3s TTFB | Next.js + Supabase, read-only |
| Magic link (geração do token) | 1s | 2s | síncrono |

## Regra de fallback quando o SLA de áudio estoura

Se o job de transcrição/categorização não concluir dentro do limite de 15s (p95), Tom envia uma
mensagem intermediária antes da confirmação final, para o usuário não achar que o sistema
travou. Ver cenário concreto em `docs/conversas-tom.md`, seção 2 ("Áudio demorando além do
SLA").

## Concorrência por usuário

Nenhuma tool de escrita (`createTransaction`, `updateTransaction`, `createTask`, `updateTask`,
`createReminder`, `updateReminder`) pode processar duas mensagens do mesmo `user_id` em
paralelo. Risco concreto: dois áudios em sequência, ou uma correção (caso 2.6 do roteiro)
chegando antes do lançamento anterior terminar de persistir — sem serialização, isso pode
gerar duas transações fora de ordem ou uma correção aplicada no registro errado.

**Decisão:** mensagens do mesmo usuário são processadas em ordem — fila dedicada por
`user_id` (ou lock otimista na linha do registro sendo editado) antes de qualquer tool de
escrita. Nunca duas tool calls de escrita do mesmo usuário em voo ao mesmo tempo.
