import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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

/** Quem já tem sessão vai pro painel; visitante vê a LP de apresentação. */
export default async function Home() {
  const userId = await getCurrentUserId();
  if (userId) redirect('/dashboard');
  return <Landing />;
}
