import type { ReactNode } from 'react';
import Link from 'next/link';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CardRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>{children}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div style={{ flex: '1 1 160px', background: '#121821', borderRadius: 8, padding: 16 }}>
      <div style={{ opacity: 0.6, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24 }}>{value}</div>
      {hint ? <div style={{ opacity: 0.5, fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p style={{ opacity: 0.6 }}>{children}</p>;
}

export function Badge({ tone, children }: { tone: 'ok' | 'bad' | 'neutral'; children: ReactNode }) {
  const colors: Record<typeof tone, string> = {
    ok: '#4ade80',
    bad: '#f87171',
    neutral: '#9fb0c0',
  };
  return <span style={{ color: colors[tone], fontSize: 13 }}>{children}</span>;
}

/** Card visual de status on-line/indisponível pra serviço externo (worker, WhatsApp, banco, fila). */
export function StatusCard({ name, ok, detail }: { name: string; ok: boolean; detail?: ReactNode }) {
  const dotColor = ok ? '#4ade80' : '#f87171';
  return (
    <div style={{ flex: '1 1 200px', background: '#121821', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span
        aria-hidden
        style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0, boxShadow: `0 0 8px ${dotColor}` }}
      />
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 13, color: dotColor, marginTop: 2 }}>{ok ? 'online' : 'indisponível'}</div>
        {detail ? <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{detail}</div> : null}
      </div>
    </div>
  );
}

export function Pagination({
  basePath,
  page,
  hasNext,
  extraParams,
}: {
  basePath: string;
  page: number;
  hasNext: boolean;
  extraParams?: Record<string, string | undefined>;
}) {
  const extra = Object.entries(extraParams ?? {})
    .filter(([, value]) => !!value)
    .map(([key, value]) => `&${key}=${encodeURIComponent(value!)}`)
    .join('');

  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 13 }}>
      {page > 0 ? (
        <Link href={`${basePath}?page=${page - 1}${extra}`} style={{ color: '#9fb0c0' }}>
          ← Anterior
        </Link>
      ) : null}
      <span style={{ opacity: 0.5 }}>Página {page + 1}</span>
      {hasNext ? (
        <Link href={`${basePath}?page=${page + 1}${extra}`} style={{ color: '#9fb0c0' }}>
          Próxima →
        </Link>
      ) : null}
    </div>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
