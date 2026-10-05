import type { ReactNode } from 'react';

export const metadata = {
  title: 'ZapBuddy',
  description: 'Painel read-only do ZapBuddy',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#0b0f14', color: '#e6edf3' }}>
        {children}
      </body>
    </html>
  );
}
