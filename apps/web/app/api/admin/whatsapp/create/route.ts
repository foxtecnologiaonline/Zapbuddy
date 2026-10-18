import { NextRequest, NextResponse } from 'next/server';
import { evolutionCreateInstance } from '@zapbuddy/core';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await evolutionCreateInstance();
    return NextResponse.redirect(new URL('/admin/whatsapp', request.url), { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/admin/whatsapp?error=${encodeURIComponent(message)}`, request.url), { status: 303 });
  }
}
