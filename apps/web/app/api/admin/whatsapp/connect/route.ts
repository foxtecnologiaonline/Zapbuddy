import { NextResponse } from 'next/server';
import { evolutionGetQrCode } from '@zapbuddy/core';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // JSON, não redirect: o QR tem vida curta e precisa chegar na tela assim
  // que gerado — o botão client-side (qr-code-button.tsx) renderiza direto.
  try {
    const base64 = await evolutionGetQrCode();
    return NextResponse.json({ base64 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
