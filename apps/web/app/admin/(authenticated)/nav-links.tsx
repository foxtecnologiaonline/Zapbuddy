'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/status', label: 'Status' },
  { href: '/admin/whatsapp', label: 'WhatsApp' },
  { href: '/admin/contacts', label: 'Contatos' },
  { href: '/admin/calls', label: 'Chamadas' },
  { href: '/admin/reminders', label: 'Lembretes' },
  { href: '/admin/errors', label: 'Erros' },
];

/**
 * Client component só por causa do usePathname — precisa saber a rota atual
 * pra destacar o item ativo, e isso não existe em server component sem
 * reconstruir a lógica de match de rota do Next.js à mão.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {NAV_LINKS.map((link) => {
        // '/admin' é prefixo de toda rota — só conta como ativo em match exato,
        // senão "Visão geral" ficaria destacado em /admin/contacts também.
        const isActive = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            style={{
              color: isActive ? '#e6edf3' : '#9fb0c0',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              borderBottom: isActive ? '2px solid #4ade80' : '2px solid transparent',
              paddingBottom: 4,
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
