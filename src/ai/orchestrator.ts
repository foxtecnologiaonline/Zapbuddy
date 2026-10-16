import { client, DEFAULT_REQUEST_OPTS } from "./model.js";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "./prompts/system.js";
import { financeTools } from "./tools/finance.js";
import { taskTools } from "./tools/tasks.js";
import { onboardingTools } from "./tools/onboarding.js";

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Único ponto de entrada do orquestrador: uma chamada ao Claude com o
 * system prompt do ZapBuddy e as tools de todos os módulos do MVP juntas.
 * Não existe "modelo do financeiro" vs "modelo de tarefas" — é o mesmo
 * modelo escolhendo qual tool usar (CLAUDE.md).
 */
export async function runOrchestrator(
  userId: string,
  history: ConversationTurn[],
) {
  const tools = [
    ...financeTools(userId),
    ...taskTools(userId),
    ...onboardingTools(userId),
  ];

  const messages = history.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  const runner = client.beta.messages.toolRunner({
    ...DEFAULT_REQUEST_OPTS,
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    tools,
    messages,
  });

  return runner;
}
