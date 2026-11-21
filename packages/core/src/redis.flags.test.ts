import { describe, expect, it } from 'vitest';
import { readWorkerConfigFlags } from './redis.js';

describe('readWorkerConfigFlags', () => {
  it('só presença, nunca o valor: chaves preenchidas viram true', () => {
    expect(readWorkerConfigFlags({ OPENWEATHERMAP_API_KEY: 'segredo', WEB_SEARCH_API_KEY: 'x', OPENAI_API_KEY: 'y' })).toEqual({
      openWeatherMapKey: true,
      webSearchKey: true,
      openaiKey: true,
    });
  });

  it('ausente ou só espaço = false (mesma regra que a leitura real da chave, com trim)', () => {
    expect(readWorkerConfigFlags({ OPENWEATHERMAP_API_KEY: '   ', WEB_SEARCH_API_KEY: '' })).toEqual({
      openWeatherMapKey: false,
      webSearchKey: false,
      openaiKey: false,
    });
  });
});
