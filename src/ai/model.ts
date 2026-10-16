import Anthropic from "@anthropic-ai/sdk";

/**
 * Único modelo da stack (CLAUDE.md: "cada assessor é um conjunto de tools,
 * não um serviço separado"). Não criar um client/model por assessor.
 *
 * Opus 5.5 é o default seguro para qualidade. Como o ZapBuddy é um produto
 * de assinatura de baixo ticket (R$29,90/mês) e o grosso do tráfego é
 * conversa curta no WhatsApp (classificar gasto, criar tarefa), vale medir
 * custo por conversa e considerar Sonnet 5.5 (`claude-sonnet-5-5`) ou efeito
 * "low" para esse tráfego de rotina antes de travar em produção — essa é
 * uma decisão de custo do produto, não algo para trocar sem medir.
 */
export const MODEL_ID = "claude-opus-5-5";

export const client = new Anthropic();

export const DEFAULT_REQUEST_OPTS = {
  model: MODEL_ID,
  max_tokens: 2048,
  output_config: { effort: "medium" as const },
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};
