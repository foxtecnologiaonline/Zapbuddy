import { z } from 'zod';
import { findUserById, inferLocationFromWhatsappNumber } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';
import { getWeatherForecast } from '../../weather/openweathermap.js';

export const getWeatherTool = defineTool({
  name: 'get_weather',
  description:
    'Previsão do tempo pros próximos dias (até 5) de uma cidade do Brasil — use pra "vai chover amanhã?", "como ' +
    'tá o tempo em Curitiba no fim de semana", "preciso de guarda-chuva?". Sem city, usa a cidade que a pessoa cadastrou (ou, sem cadastro, a região do DDD) ' +
    '(devolvida em place — diga qual cidade usou se não foi ela que pediu). Os números vêm do provedor; se vier ' +
    'status diferente de ok, diga que não conseguiu checar agora — nunca chute o tempo.',
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
