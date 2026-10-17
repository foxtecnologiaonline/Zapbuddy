import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY é obrigatório');
    client = new Anthropic({ apiKey });
  }
  return client;
}
