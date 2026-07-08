// Tiny inline trend line for table cells. Fixed-size SVG, no axes — the
// current value is rendered as text next to it by the caller.

interface Props {
  /** Series values in time order; nulls are skipped. */
  values: (number | null)[];
  /** Y-axis max; values are clamped to it (default 100, for percentages). */
  max?: number;
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, max = 100, color = 'var(--accent)', width = 84, height = 24 }: Props) {
  const pts = values
    .map((v, i) => ({ i, v }))
    .filter((p): p is { i: number; v: number } => typeof p.v === 'number');
  if (pts.length < 2) return <span className="muted">—</span>;

  const n = values.length;
  const pad = 2;
  const x = (i: number) => pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v: number) => {
    const clamped = Math.max(0, Math.min(max, v));
    return height - pad - (clamped / max) * (height - pad * 2);
  };
  const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.2} fill={color} />
    </svg>
  );
}
