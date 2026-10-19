// Componentes visuais puros (SVG/CSS, zero dependência nova) — mesmo padrão
// do Sparkline já usado no admin (apps/web/app/admin/(authenticated)/components.tsx),
// copiado/adaptado aqui em vez de compartilhado: evita um refactor
// cross-cutting pra reusar ~15 linhas de SVG, mantém o diff isolado do admin.

export function Sparkline({ data, width = 240, height = 48, color = 'var(--expense)' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((value, index) => `${index * stepX},${height - (value / max) * height}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`tendência dos últimos ${data.length} dias`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const CATEGORY_BARS_TOP_N = 6;

/** Barras horizontais por categoria, ordenadas por valor desc — top N + "outros" agregado. */
export function CategoryBars({ byCategory }: { byCategory: Record<string, number> }) {
  const entries = Object.entries(byCategory).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  const top = entries.slice(0, CATEGORY_BARS_TOP_N);
  const rest = entries.slice(CATEGORY_BARS_TOP_N);
  const restTotal = rest.reduce((sum, [, cents]) => sum + cents, 0);
  const rows = restTotal > 0 ? [...top, ['outros', restTotal] as [string, number]] : top;
  const max = Math.max(...rows.map(([, cents]) => cents), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([category, cents]) => (
        <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category}</span>
          <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(cents / max) * 100}%`, background: 'var(--expense)', height: 8, borderRadius: 4 }} />
          </div>
          <span style={{ width: 70, textAlign: 'right', flexShrink: 0, opacity: 0.8 }}>
            {(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      ))}
    </div>
  );
}

