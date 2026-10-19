# ADR 0006 — Landing page pública do Tom

**Status:** aceito e implementado (2026-10). Escopo: a página pública em `/` que apresenta o Tom a
quem ainda não tem conta e leva pro WhatsApp. Não cobre SEO avançado, analytics nem A/B de copy.

## Contexto

Não existia página pública. `apps/web/app/page.tsx` só redirecionava: logado → `/dashboard`,
deslogado → `/login` (magic link, pensado pra quem já tem conta). Quem chega por uma indicação
ou um anúncio não tinha onde entender o produto nem um botão de começo. A entrada no produto é
sempre pelo WhatsApp (`getOrCreateUser` no webhook cria a conta na primeira mensagem), então a LP
precisa terminar num link `wa.me` pro número do Tom, não num formulário de cadastro.

## Decisões

### 1. `/` vira a LP pra visitante; logado continua indo pro painel
`page.tsx` mantém a checagem de sessão que já existe: se há `userId`, redireciona pra
`/dashboard` (comportamento atual preservado). Se não há, renderiza a LP. `/login` não muda.
A checagem continua dinâmica (`cookies()`), e o custo é uma leitura de cookie por request; a LP
em si não consulta banco nem API.

### 2. Conteúdo como dado tipado, não JSX espalhado
Textos ficam em `apps/web/app/landing/content.ts` (objetos tipados, sem JSX). O componente só
mapeia. Assim a checagem de regras de produto (copy proibido, preço) roda em teste unitário sem
renderizar React.

### 3. Preço vem de `MONTHLY_PRICE_CENTS`, nunca digitado na LP
O preço é o mesmo que a Asaas cobra e que o Tom cita na conversa (`packages/core/src/payments/plan.ts`).
A LP importa `formatMonthlyPriceBRL` de `@zapbuddy/core`. Trade-off registrado: o pacote core não
tem subpath de export, então a importação puxa o barrel (clientes Redis/BullMQ/LLM). Isso só
acontece no servidor (RSC, nada vai pro cliente) e já é o padrão das páginas admin; não vale
duplicar o preço em outro lugar, que é o erro que a fonte única evita.

### 4. CTA único: WhatsApp com mensagem pré-preenchida
Todo botão de ação aponta pra `https://wa.me/<numero>?text=Oi%2C%20Tom!`. A mensagem pré-preenchida
é o gatilho natural do onboarding (primeira mensagem = cadastro). O número vem de
`NEXT_PUBLIC_TOM_WHATSAPP_NUMBER` (E.164 sem `+`, ex.: `5511999999999`). Sem número válido, o
botão cai em `#precos` em vez de quebrar — a página continua funcional e o problema fica visível
pra quem configura, não escondido num link morto. Essa variável precisa estar setada na Vercel
antes do deploy.

### 5. Zero dependência de terceiros no front
Sem fonte externa, sem imagem externa, sem script de analytics, sem biblioteca de UI. A LP é HTML
e CSS Module renderizados no servidor. Motivo: performance no celular (público chega pelo
WhatsApp/Instagram, em rede móvel) e nenhuma superfície nova de privacidade.
Mockup de conversa é CSS puro, com falas reais do roteiro de voz do Tom (`system-prompt.ts`).

### 6. Visual: a identidade já existente, com um acento
Mantém as variáveis de `globals.css` (fundo escuro, texto claro). Acento único em verde WhatsApp
(`#25d366`) só nos botões de ação, pra o CTA ser o elemento de maior contraste da página.
Mobile-first: uma coluna até 760px, 3 colunas acima disso. Gutter lateral de 16px. Sem animação
(nada a comunicar com movimento, e menos custo de tela).

### 7. Regras de copy (decisões de produto, não preferência de estilo)
Derivadas do `CLAUDE.md`, e verificadas por teste em `content.test.ts`:
- **Nada de prova social inventada**: sem número de clientes, depoimento ou avaliação.
- **Nada de urgência fabricada**: sem "últimas vagas" nem contador regressivo.
- **Nada de promessa de rendimento** sobre dinheiro.
- **Open Finance não aparece como promessa**: o Tom não conecta conta bancária (fora do escopo
  travado). A LP diz explicitamente que não acessa banco.
- **Posicionamento B2C**: o público é pessoa física. MEI/autônomo aparece como um dos usos do
  dia a dia, nunca como produto de gestão empresarial. Nota fiscal e DAS ficam explicitamente
  fora (FAQ).
- **Só o que existe**: cada função listada tem tool ou fila correspondente no código. Lembrete
  por contexto de conversa e hábitos com streak não entram, porque não existem.
- **Cancelamento**: a LP diz que é pedido pelo WhatsApp e que uma pessoa cuida. Não promete
  "cancela com um clique", porque hoje `intent: "cancel"` só avisa um humano.

### 8. Preço e trial
Trial de 7 dias e preço único de R$ 27,90/mês, pagamento via PIX, boleto ou cartão (checkout
Asaas). A LP avisa que o CPF (ou CNPJ) é pedido ao fechar, porque é exigência da Asaas e não
convém a pessoa descobrir isso no fim.

## Estrutura de arquivos

```
apps/web/app/page.tsx                       — sessão → /dashboard; senão renderiza <Landing />
apps/web/app/landing/content.ts             — copy tipado (seções, FAQ, preço)
apps/web/app/landing/whatsapp.ts           — normaliza número e monta o link wa.me (puro)
apps/web/app/landing/Landing.tsx            — componente de apresentação (server component)
apps/web/app/landing/landing.module.css     — estilos escopados
apps/web/app/landing/whatsapp.test.ts      — testes do link
apps/web/app/landing/content.test.ts       — regras de copy e preço
```

## Consequências

- Visitante passa a ver a LP em `/` em vez de cair direto no login. Quem já tem conta não sente
  diferença (continua indo pro painel).
- Uma variável de ambiente nova (`NEXT_PUBLIC_TOM_WHATSAPP_NUMBER`) é obrigatória em produção
  pro CTA levar ao WhatsApp. Adicionada em `.env.example`.
- Métrica de conversão (visita → mensagem no WhatsApp) não é medida nesta rodada. O clique no
  `wa.me` não tem rastro no servidor. Se for medido depois, o caminho é um parâmetro de origem na
  mensagem pré-preenchida, lido no onboarding, não script de terceiro.
