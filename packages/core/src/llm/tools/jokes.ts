import { z } from 'zod';
import { defineTool } from '../tool-types.js';
import { JOKE_THEMES, pickJoke } from '../jokes.js';

export const tellJokeTool = defineTool({
  name: 'tell_joke',
  description:
    'Piada do banco curado do Tom. SOMENTE quando ela pedir. Conte exatamente como veio. already_told_ids: ids já contados nesta conversa.',
  schema: z.object({
    theme: z.enum(JOKE_THEMES).optional(),
    already_told_ids: z.array(z.string()).optional(),
  }),
  execute: async (params) => {
    const joke = pickJoke(params.theme, params.already_told_ids ?? []);
    return { id: joke.id, theme: joke.theme, joke: joke.text, repeated: joke.repeated };
  },
});
