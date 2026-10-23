-- Pergunta de conclusao proativa pra tarefa atrasada (2026-10, pedido do
-- usuario, incidente real): o resumo matinal listava uma tarefa com due_at
-- no passado em "tarefas de hoje e atrasadas" pra sempre, mas o Tom nunca
-- perguntava se ela de fato aconteceu — a pessoa via a mesma linha todo dia
-- sem nenhum convite a resolver. follow_up_asked_at marca que essa pergunta
-- ja foi feita uma vez pra essa tarefa, pra nunca perguntar de novo (mesma
-- logica de "nunca duas vezes" ja usada em outros fluxos proativos do
-- produto, ex.: convite de venda, tentativa de retencao de cancelamento).
alter table tasks add column if not exists follow_up_asked_at timestamptz;
