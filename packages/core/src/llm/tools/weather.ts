import { z } from 'zod';
import { findUserById, inferLocationFromWhatsappNumber } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { getWeatherForecast } from '../../weather/openweathermap.js';

export const getWeatherTool = defineTool({
  name: 'get_weather',
  description:
    'Previsão de até 5 dias pra uma cidade do Brasil. Sem city usa a cidade cadastrada (ou a região do DDD) — diga qual usou (place) se ela não pediu. status diferente de ok → diga que não conseguiu checar, nunca chute.',
  schema: z.object({
    city: z.string().min(1).max(80).optional().describe('Cidade (ex.: "Curitiba"). Omita pra usar a região da pessoa.'),
    days: z.number().int().min(1).max(5).default(2).describe('Quantos dias de previsão, começando por hoje.'),
  }),
  execute: async (params, ctx) => {
    // Cidade que a própria pessoa cadastrou (set_city) vale mais que a aproximação pelo DDD.
    const user = await findUserById(ctx.userId);
    const location =
      user?.city && user.city_latitude !== null && user.city_longitude !== null
        ? { city: user.city, latitude: user.city_latitude, longitude: user.city_longitude }
        : inferLocationFromWhatsappNumber(ctx.whatsappNumber);
    const lookup = await getWeatherForecast({
      city: params.city,
      fallback: location,
      timezone: ctx.timezone,
      days: params.days,
    });

    if (lookup.status !== 'ok') return { status: lookup.status };
    return {
      status: 'ok',
      place: lookup.place,
      used_person_region: !params.city,
      days: lookup.days.map((day) => ({
        date: day.date,
        min_c: day.minTempC,
        max_c: day.maxTempC,
        description: day.description,
        rain_expected: day.rainExpected,
        rain_chance_percent: day.rainChancePercent,
      })),
    };
  },
});
