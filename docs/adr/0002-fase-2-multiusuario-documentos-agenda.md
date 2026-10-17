# ADR 0002 — Fase 2: multiusuário, documentos+busca, Google Agenda

**Status:** aceito e implementado (2026-10). Escopo decidido com o usuário: Open Finance
explicitamente fora desta rodada (fica pra uma próxima); as outras três frentes do roadmap de
Fase 2 do `CLAUDE.md` entram juntas porque multiusuário é fundação para as outras duas.

## Contexto

O `CLAUDE.md` trava: "Nenhuma feature de Fase 2/3 entra em código antes do MVP validar retenção
básica". Essa validação foi confirmada pelo usuário como já feita fora deste repo antes de
autorizar esta rodada — não é uma mudança de convenção, é o gate sendo cumprido.

Antes desta ADR, todo dado (`transactions`, `tasks`, `reminders`) era escopado por `user_id`,
1:1 com o número de WhatsApp que mandou a mensagem. Multiusuário exige que dois números
diferentes compartilhem o mesmo financeiro/tarefas — isso muda a unidade de escopo de dado de
"usuário" para "conta", o que afeta todo tool de escrita/leitura, o dashboard e (potencialmente)
documentos e agenda que viriam depois. Por isso multiusuário vai primeiro: implementar
documentos/agenda direto por `user_id` e migrar depois seria retrabalho.

## Decisão 1 — Modelo de conta

- `users` continua sendo a identidade de login (1 linha por número de WhatsApp, como hoje).
- Nova tabela `accounts` é a unidade de escopo de dado (financeiro, tarefas, lembretes,
  documentos, conexão de agenda).
- Nova tabela `account_members (account_id, user_id unique, role: owner|member)` — **um usuário
  pertence a no máximo uma conta por vez** (sem troca de conta/múltiplas contas por usuário nesta
  versão — WhatsApp não tem um seletor de "workspace", então isso manteria a conversa ambígua:
  "em qual conta eu tô agora?"). Se isso virar necessidade real, é uma ADR nova.
- Toda conta nova (usuário que nunca recebeu convite) é criada automaticamente como `owner` da
  própria conta — comportamento idêntico ao de hoje do ponto de vista de quem usa sozinho, só
  que por baixo já existe uma `account` com 1 membro.
- **Convite determinístico, nunca decidido pela IA:** `invite_member` (tool, só `owner`) gera um
  código numérico de 6 dígitos válido por 15 min (mesma janela dos magic links). A pessoa
  convidada manda `entrar <código>` como uma das primeiras mensagens — isso é interceptado em
  `orchestrator.ts` **antes** de qualquer chamada ao LLM (regex determinística), nunca uma tool
  que o modelo decide chamar. Motivo: decidir se um número de WhatsApp entra na conta financeira
  de outra pessoa é exatamente o tipo de decisão que a regra não-negociável do CLAUDE.md ("a IA
  nunca inventa dado financeiro") diz que não pode depender de interpretação de linguagem
  natural — um prompt injection bem-sucedido não pode fazer a IA "decidir" aceitar um convite.
- Dado é sempre gravado com `account_id` (escopo) **e** `user_id` de quem mandou a mensagem
  (auditoria — "quem lançou" fica rastreável mesmo em conta compartilhada).

## Decisão 2 — Documentos: storage + busca textual, sem OCR/extração

Escopo do CLAUDE.md diz só "documentos com storage + busca" — não pede extração de conteúdo.
Implementar OCR/parsing de PDF/imagem seria scope creep caro (custo de IA por upload, biblioteca
nova, latência) sem pedido explícito. Decisão: busca é por **nome do arquivo + legenda** que a
pessoa manda junto (campo `caption` do WhatsApp), via `tsvector` do Postgres
(`to_tsvector('portuguese', ...)`), não por conteúdo do arquivo. Fica registrado aqui como
limite consciente: "procura a nota fiscal da gráfica" só funciona se a legenda ou o nome do
arquivo mencionar isso — não se o texto só existir dentro do PDF escaneado. Se isso se provar
insuficiente na prática, extração de texto é a evolução natural, não implementada agora.

Upload não é uma tool do orquestrador — mensagens de documento/imagem do WhatsApp são
processadas por um handler dedicado (`document-upload`, mesmo padrão de áudio), gravam o arquivo
no Supabase Storage (bucket privado `documents`) e confirmam por mensagem fixa, sem passar pelo
LLM. Isso mantém a regra "nunca inventa dado" — o registro do documento é puramente mecânico,
não uma interpretação de linguagem natural.

## Decisão 3 — Google Agenda: OAuth via dashboard, não via WhatsApp

WhatsApp não suporta um fluxo de consentimento OAuth (precisa de redirect de navegador). A
pessoa autentica no dashboard (já logado via magic link) e clica em "Conectar Google Agenda" —
isso parte pro fluxo OAuth padrão do Google, o callback grava o refresh token **criptografado em
repouso** (AES-256-GCM, chave em `TOKEN_ENCRYPTION_KEY`) associado à `account_id` da sessão.

Conexão é **por conta, não por usuário** (`calendar_connections.account_id` único) — numa conta
compartilhada, qualquer membro pode criar evento no mesmo calendário conectado pelo dono; não há
"meu calendário" vs. "calendário de outro membro" nesta versão (simplificação deliberada, mesmo
raciocínio da decisão 1: WhatsApp não tem seletor de contexto).

Sem biblioteca `googleapis` (SDK pesado) — chamadas REST diretas (`fetch` com o helper
`fetchWithRetry` já existente), consistente com o resto do código (WhatsApp Cloud API e Whisper
já são fetch direto, não SDK). Token de acesso é sempre renovado via refresh token antes de cada
chamada à Calendar API (sem cache de access token) — simples, 1 round-trip extra por evento
criado, aceitável pro volume esperado.

## Consequências

- `ToolContext` ganha `accountId` e `role` — toda tool de finance/tasks/reminders passa a
  escopar por `accountId` em vez de `userId` (mantendo `userId` como autor/auditoria).
- Dashboard web passa a resolver `accountId` da sessão e mostrar dado agregado da conta (pode
  incluir lançamentos de mais de um membro).
- Admin (`/admin`) não muda — segue olhando `users`/contagens globais, não precisa saber de
  conta pra sua finalidade de observabilidade operacional.
- Risco conhecido, não mitigado nesta rodada: nenhuma UI pra "sair da conta" ou remover membro —
  só criação de conta nova e entrada via convite. Suficiente pro caso de uso (sócio/cônjuge
  convidado uma vez), não para gestão de equipe completa.
