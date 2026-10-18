import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/admin-auth';

const NAV_LINKS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/status', label: 'Status' },
  { href: '/admin/contacts', label: 'Contatos' },
  { href: '/admin/calls', label: 'Chamadas' },
  { href: '/admin/reminders', label: 'Lembretes' },
  { href: '/admin/errors', label: 'Erros' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isAdminRequest())) redirect('/admin/login');

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <nav style={{ display: 'flex', gap: 16 }}>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} style={{ color: '#9fb0c0', textDecoration: 'none', fontSize: 14 }}>
              {link.label}
            </Link>
          ))}
        </nav>
        <form action="/api/admin/logout" method="POST">
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid #2a3340',
              color: '#e6edf3',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Sair
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
