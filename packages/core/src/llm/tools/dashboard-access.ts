import { z } from 'zod';
import { createMagicLink } from '@zapbuddy/db';
import { defineTool } from '../tool-types.js';

export const sendDashboardLoginLinkTool = defineTool({
  name: 'send_dashboard_login_link',
  description:
    'Gera e informa um link de acesso (válido por 15 minutos) ao dashboard web read-only. ' +
    'Use quando o usuário pedir para ver o painel, dashboard, ou "ver online".',
  schema: z.object({}),
  execute: async (_params, ctx) => {
    const token = await createMagicLink(ctx.userId);
    const baseUrl = process.env.WEB_APP_URL;
    if (!baseUrl) throw new Error('WEB_APP_URL must be set');
    const url = `${baseUrl}/api/auth/verify?token=${token}`;
    return { login_url: url, expires_in_minutes: 15 };
  },
});
