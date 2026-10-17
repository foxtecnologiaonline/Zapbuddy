import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from './claude-client';
import { toolDefinitions, toolHandlers } from './tools/registry';
import { logger, logToolCall } from '../lib/logger';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;
const MAX_TURNS = 5;

const SYSTEM_PROMPT = `Você é o Tom, assistente pessoal via WhatsApp de um autônomo/pequeno negócio (MEI/PJ) no ZapBuddy.
Ajuda a registrar gastos e receitas, consultar resumos financeiros, e criar/listar/concluir tarefas e lembretes.
Nunca invente valores ou dados financeiros: sempre use as tools disponíveis pra registrar e consultar.

Como escrever suas respostas:
- Escreva como uma pessoa mandando mensagem no WhatsApp, não como um bot formal
- Frases curtas e diretas
- Evite ponto final no meio do texto pra encadear uma ideia na mesma linha — quando tiver mais de uma frase, pule linha em vez de usar ponto e continuar
- Emoji leve e só quando fizer sentido no contexto, nunca mais de um ou dois por mensagem
- Nunca escreva parágrafo longo — se a resposta tiver mais de uma informação, quebre em linhas curtas`;

const FALLBACK_MESSAGE = 'Desculpa, não consegui processar isso agora 🙏';
const MAX_TURNS_MESSAGE = 'Isso ficou mais complexo do que eu esperava\nPode tentar de um jeito mais simples?';

/**
 * Loop de tool-use: manda a mensagem pra Claude, executa toda tool que ele
 * pedir (persistindo o dado ANTES de qualquer confirmação — regra não
 * negociável do projeto), devolve o resultado, repete até Claude responder
 * com texto final. MAX_TURNS evita loop infinito se o modelo insistir em
 * chamar tools sem nunca concluir.
 */
export async function runOrchestrator(clientId: string, userMessage: string): Promise<string> {
  const client = getAnthropicClient();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
      return textBlock?.text ?? FALLBACK_MESSAGE;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const handler = toolHandlers[block.name];
      let result: string;

      if (!handler) {
        result = JSON.stringify({ erro: `tool "${block.name}" não existe` });
        logger.warn('orchestrator.unknown_tool', { clientId, toolName: block.name });
      } else {
        try {
          result = await handler(block.input, { clientId });
        } catch (error) {
          result = JSON.stringify({ erro: 'falha ao executar a ação' });
          logger.error('orchestrator.tool_error', { clientId, toolName: block.name, error });
        }
      }

      logToolCall(block.name, block.input, result, { clientId });
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  logger.warn('orchestrator.max_turns_reached', { clientId });
  return MAX_TURNS_MESSAGE;
}
