-- Melhorias de personalidade do Tom (2026-10): apelido/forma de chamar a pessoa.
-- O resto da rodada ("turbinar o tom" — detecção de tom emocional, streak de
-- constância, variação de fala) é só system prompt + lógica pura em código,
-- sem precisar de coluna nova — ver docs/tools-contrato.md.

-- Separado de `name` (dado formal do cadastro) de propósito: a pessoa pode
-- querer ser chamada de um jeito mais informal do que o nome que ela mesma
-- deu no onboarding (ex.: "Marina" → "Mari"), sem precisar "corrigir" o
-- cadastro formal pra isso.
alter table users add column if not exists preferred_name text;
