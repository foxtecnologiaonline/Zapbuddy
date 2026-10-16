import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Tom',
  description: 'Painel read-only do Tom',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: 'var(--bg)', color: 'var(--fg)' }}>
        {children}
      </body>
    </html>
  );
}
