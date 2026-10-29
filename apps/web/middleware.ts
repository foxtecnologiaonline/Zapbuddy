import { NextResponse, type NextRequest } from 'next/server';

/**
 * Painel inibido até próxima ordem (2026-10, ver packages/core/src/features.ts):
 * sem `DASHBOARD_ENABLED=true`, as telas do painel mostram "indisponível" e as
 * rotas de API dele respondem 503. Não toca em nada que não seja do painel —
 * webhook do WhatsApp, health, webhook de pagamento, API pública (/api/v1) e
 * admin ficam de fora do matcher. A checagem é inline (não importa
 * @zapbuddy/core) pra o middleware ficar leve no runtime de edge.
 */
export function middleware(request: NextRequest): NextResponse {
  if (process.env.DASHBOARD_ENABLED === 'true') return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'dashboard_disabled', message: 'Painel temporariamente indisponível.' }, { status: 503 });
  }
  return NextResponse.rewrite(new URL('/painel-indisponivel', request.url));
}

export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/api/auth/:path*', '/api/dashboard/:path*', '/api/calendar/:path*'],
};
