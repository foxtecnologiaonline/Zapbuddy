import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/admin-auth';
import { NavLinks } from './nav-links';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isAdminRequest())) redirect('/admin/login');

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '16px 16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <NavLinks />
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
