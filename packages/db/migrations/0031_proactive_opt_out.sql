-- Opt-out das mensagens proativas que ainda não tinham como ser desligadas (2026-11): o insight diário das 19h e o
-- resumo semanal de sexta. Até aqui a pessoa só conseguia silenciá-los pelo horário de silêncio. Idempotente
-- (if not exists), sem dado destrutivo, default LIGADO (quem já recebia continua recebendo até pedir pra parar).
--
-- O código tolera esta migration ainda não aplicada: o sweep lê estas colunas numa consulta SEPARADA com fallback para
-- "ninguém desligou", então o deploy do worker antes do SQL não derruba nada. Sem a migration, só não dá pra DESLIGAR
-- (o Tom diz que não conseguiu em vez de fingir). Lembretes que a pessoa marcou e avisos de data importante NÃO entram
-- aqui: foram pedidos por ela e continuam valendo.

alter table users add column if not exists routine_insights boolean not null default true;
alter table users add column if not exists routine_weekly_digest boolean not null default true;
