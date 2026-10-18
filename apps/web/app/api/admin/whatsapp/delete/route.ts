import { NextRequest, NextResponse } from 'next/server';
import { evolutionConfiguredInstanceName, evolutionDeleteInstance } from '@zapbuddy/core';
import { logAdminAction } from '@zapbuddy/db';
import { isAdminRequest } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rotas de API do admin não passam pelo layout.tsx (que só protege páginas) — checagem própria aqui.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const confirm = form.get('confirm');
  const instanceName = evolutionConfiguredInstanceName();

  // Exige digitar o nome exato da instância configurada — nunca aceita um
  // nome vindo do form como alvo da exclusão (evolutionDeleteInstance não
  // recebe parâmetro, só lê EVOLUTION_INSTANCE_NAME), então isto é só o
  // "tem certeza?" antes de uma ação destrutiva, não uma seleção de alvo.
  if (typeof confirm !== 'string' || !instanceName || confirm !== instanceName) {
    return NextResponse.redirect(new URL('/admin/whatsapp?error=Confirma%C3%A7%C3%A3o+n%C3%A3o+bateu+com+o+nome+da+inst%C3%A2ncia', request.url), {
      status: 303,
    });
  }

  try {
    await evolutionDeleteInstance();
    void logAdminAction({ action: 'evolution_instance_deleted', targetType: 'evolution_instance', targetId: instanceName });
    return NextResponse.redirect(new URL('/admin/whatsapp', request.url), { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(new URL(`/admin/whatsapp?error=${encodeURIComponent(message)}`, request.url), { status: 303 });
  }
}
