import Anthropic from "@anthropic-ai/sdk";
import { IncomingMessageJob } from "../queue/queue";
import { toolDefinitions, toolHandlers } from "./tools";
import { withToolLogging } from "../lib/logger";
import { AppError, toUserMessage } from "../lib/errors";
import { getConversationContext, appendConversationTurn, getStructuredSnapshot } from "./context";
import {
  getOnboardingState,
  onboardingPrompt,
  markOnboardingPrompted,
  completeOnboarding,
} from "./onboarding";

const MODEL = "claude-sonnet-4-5";
const MAX_TOOL_ITERATIONS = 4;

function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurado");
  return new Anthropic({ apiKey });
}

function systemPrompt(snapshot: { recentTransactions: unknown[]; pendingTasks: unknown[] }): string {
  return (
    "Você é o Tom, assistente financeiro pessoal via WhatsApp. Seja direto, use linguagem natural do " +
    "dia a dia, nunca técnica. Nunca confirme um gasto, receita ou tarefa sem antes chamar a tool " +
    "correspondente — você não tem permissão para inventar ou assumir que algo foi salvo.\n\n" +
    `Transações recentes: ${JSON.stringify(snapshot.recentTransactions)}\n` +
    `Tarefas pendentes: ${JSON.stringify(snapshot.pendingTasks)}`
  );
}

async function transcribeAudio(mediaId: string | undefined): Promise<string> {
  if (!mediaId) {
    throw new AppError("audioMediaId ausente", "Não recebi o áudio direito, pode mandar de novo?");
  }
  // Integração com o provedor de transcrição entra aqui quando o provedor for escolhido; o envio
  // via fila BullMQ (já decidido na arquitetura) é o que torna essa etapa assíncrona e segura.
  throw new AppError(
    "Transcrição de áudio ainda não implementada",
    "Por enquanto só consigo processar texto — manda por escrito?"
  );
}

// Contexto conversacional (curto prazo) e dado estruturado (longo prazo) são buscados
// separadamente a cada turno — o segundo nunca depende do primeiro ter sobrevivido na conversa.
export async function runOrchestrator(job: IncomingMessageJob): Promise<string> {
  const { userId, text } = job;
  if (!userId) {
    throw new AppError("userId ausente no job", "Não consegui identificar seu cadastro.");
  }

  const onboardingState = await getOnboardingState(userId);
  if (onboardingState === "new") {
    await markOnboardingPrompted(userId);
    return onboardingPrompt();
  }

  let greeting = "";
  if (onboardingState === "awaiting_reply" && text) {
    const name = await completeOnboarding(userId, text);
    greeting = `Prazer, ${name}! `;
  }

  const userText = job.kind === "audio" ? await transcribeAudio(job.audioMediaId) : text ?? "";
  appendConversationTurn(userId, { role: "user", content: userText });

  const snapshot = await getStructuredSnapshot(userId);
  const client = anthropic();

  const messages: Anthropic.MessageParam[] = getConversationContext(userId).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  let finalText = "Feito!";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(snapshot),
      tools: toolDefinitions as Anthropic.Tool[],
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    if (textBlock) finalText = textBlock.text;

    if (toolUseBlocks.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const handler = toolHandlers[block.name];
      if (!handler) continue;

      try {
        // Toda tool call passa pelo logger, sucesso ou erro — é o ciclo de melhoria do item 4.
        const result = await withToolLogging(userId, block.name, block.input as Record<string, unknown>, () =>
          handler(userId, block.input)
        );
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: toUserMessage(err),
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  const reply = greeting + finalText;
  appendConversationTurn(userId, { role: "assistant", content: reply });
  return reply;
}
