import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { JOKE_THEMES, pickJoke } from '../jokes.js';

export const tellJokeTool = defineTool({
  name: 'tell_joke',
  description:
    'Devolve uma piada do banco curado do Tom. Use SOMENTE quando a pessoa pedir uma piada, ' +
    'nunca por conta própria. Conte o texto exatamente como veio, sem reescrever nem explicar. ' +
    'Em already_told_ids passe os ids que você já contou nessa conversa, pra não repetir.',
  schema: z.object({
    theme: z.enum(JOKE_THEMES).optional(),
    already_told_ids: z.array(z.string()).optional(),
  }),
  execute: async (params) => {
    const joke = pickJoke(params.theme, params.already_told_ids ?? []);
    return { id: joke.id, theme: joke.theme, joke: joke.text, repeated: joke.repeated };
  },
});
