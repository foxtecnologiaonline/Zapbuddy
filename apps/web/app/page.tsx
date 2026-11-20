import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isBillingEnabled, isDashboardEnabled } from '@zapbuddy/core';
import { getCurrentUserId } from '@/lib/auth';
import { Landing } from './landing/Landing';

export const metadata: Metadata = {
  title: 'Tom — seu parceiro pessoal no WhatsApp',
  description:
    'O Tom cuida da sua agenda, das suas tarefas, das suas notas e do seu dinheiro, 24 horas por dia, direto no WhatsApp.',
  openGraph: {
    title: 'Tom — seu parceiro pessoal no WhatsApp',
    description:
      'Agenda, tarefas, notas e financeiro pessoal, 24 horas por dia, direto no WhatsApp.',
    type: 'website',
    locale: 'pt_BR',
  },
};

/** Flags e número do WhatsApp são variáveis de runtime: a página nunca pode ser prerenderizada no build. */
export const dynamic = 'force-dynamic';

/**
 * Quem já tem sessão vai pro painel (se estiver ligado); visitante vê a LP de apresentação.
 * Flags lidas a cada request: ligar/desligar painel ou cobrança é só variável + redeploy.
 */
export default async function Home() {
  const dashboard = isDashboardEnabled();
  if (dashboard) {
    const userId = await getCurrentUserId();
    if (userId) redirect('/dashboard');
  }
  return <Landing billing={isBillingEnabled()} dashboard={dashboard} />;
}
