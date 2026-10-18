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

/**
 * Wrapper com overflow-x pra tabela não quebrar o layout em tela de celular
 * (a maioria das tabelas do admin tem 4-6 colunas de largura fixa-ish, que
 * não cabem numa viewport de ~360px) — rola a tabela em vez de espremer ou
 * vazar pro lado.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>;
}

/**
 * Cabeçalho de coluna clicável pra ordenar — alterna asc/desc na mesma
 * coluna; trocar de coluna sempre entra ordenando desc (mais relevante
 * primeiro: mais novo, maior valor). Preserva os outros filtros da página
 * via `extraParams`, senão trocar ordenação resetaria busca/status.
 */
export function SortableHeader({
  label,
  column,
  currentSort,
  currentDir,
  basePath,
  extraParams,
}: {
  label: string;
  column: string;
  currentSort?: string;
  currentDir?: 'asc' | 'desc';
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === 'asc' ? 'desc' : isActive ? 'asc' : 'desc';
  const params = new URLSearchParams();
  Object.entries(extraParams ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('sort', column);
  params.set('dir', nextDir);

  return (
    <th style={{ padding: '4px 8px' }}>
      <Link href={`${basePath}?${params.toString()}`} style={{ color: isActive ? '#e6edf3' : 'inherit', textDecoration: 'none' }}>
        {label}
        {isActive ? (currentDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </Link>
    </th>
  );
}

/**
 * Nav Anterior/Próxima pra listas paginadas por cursor (keyset), não por
 * número de página — ver listToolCallLogsCursorPage. `cursor` é o início da
 * página atual ('' significa a primeira página). `history` é a pilha dos
 * cursores das páginas anteriores (join por vírgula na URL) — "Anterior" só
 * desempilha, sem precisar de uma query reversa.
 */
export function CursorPagination({
  basePath,
  cursor,
  history,
  nextCursor,
  extraParams,
}: {
  basePath: string;
  cursor: string;
  history: string[];
  nextCursor: string | null;
  extraParams?: Record<string, string | undefined>;
}) {
  const buildHref = (nextCursorValue: string, nextHistory: string[]) => {
    const params = new URLSearchParams();
    Object.entries(extraParams ?? {}).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (nextCursorValue) params.set('cursor', nextCursorValue);
    if (nextHistory.length > 0) params.set('history', nextHistory.join(','));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 13 }}>
      {history.length > 0 ? (
        <Link href={buildHref(history[history.length - 1] ?? '', history.slice(0, -1))} style={{ color: '#9fb0c0' }}>
          ← Anterior
        </Link>
      ) : null}
      {nextCursor ? (
        <Link href={buildHref(nextCursor, [...history, cursor])} style={{ color: '#9fb0c0' }}>
          Próxima →
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Mini-gráfico de linha inline (SVG puro, sem lib de chart) — só pra "tá
 * subindo ou caindo", não pra leitura de valor exato (por isso sem eixo).
 */
export function Sparkline({ data, width = 160, height = 32, color = '#4ade80' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((value, index) => `${index * stepX},${height - (value / max) * height}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`tendência dos últimos ${data.length} dias: ${data.join(', ')}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
