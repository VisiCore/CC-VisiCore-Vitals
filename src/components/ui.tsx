import type { ReactNode } from 'react';
import type { Health } from '../api/types';
import { normHealth } from '../lib/metrics';

// ---- Card ---------------------------------------------------------------
export function Card({
  title,
  note,
  right,
  children,
  className = '',
}: {
  title?: string;
  note?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          <span className="card-title">{title}</span>
          {right ?? (note && <span className="card-note">{note}</span>)}
        </div>
      )}
      {children}
    </div>
  );
}

// ---- Stat tile ----------------------------------------------------------
export function StatTile({
  label,
  value,
  unit,
  foot,
  delta,
  accent,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  foot?: ReactNode;
  delta?: { text: string; dir: 'up' | 'down' | 'flat' };
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-row">
        {accent && <span className="stat-accent" style={{ background: accent }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="stat-label">
            {icon}
            {label}
          </div>
          <div className="stat-value">
            {value}
            {unit && <span className="unit">{unit}</span>}
          </div>
          {(foot || delta) && (
            <div className="stat-foot">
              {delta && (
                <span className={`delta-${delta.dir}`}>
                  {delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '＝'} {delta.text}
                </span>
              )}
              {foot}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Health badge -------------------------------------------------------
const HEALTH_LABEL: Record<Health, string> = {
  Green: 'Healthy',
  Yellow: 'Warning',
  Red: 'Unhealthy',
  Unknown: 'Unknown',
};
const HEALTH_CLASS: Record<Health, string> = {
  Green: 'badge-green',
  Yellow: 'badge-yellow',
  Red: 'badge-red',
  Unknown: 'badge-gray',
};

export function HealthBadge({ health, label }: { health: string | undefined; label?: string }) {
  const h = normHealth(health);
  return (
    <span className={`badge ${HEALTH_CLASS[h]}`}>
      <span className="dot" />
      {label ?? HEALTH_LABEL[h]}
    </span>
  );
}

// ---- Meter --------------------------------------------------------------
export function Meter({ pct, color }: { pct: number; color?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const c = color ?? (p > 90 ? 'var(--critical)' : p > 75 ? 'var(--warning)' : 'var(--good)');
  return (
    <div className="meter">
      <div className="meter-fill" style={{ width: `${p}%`, background: c }} />
    </div>
  );
}

// ---- Bar list -----------------------------------------------------------
export function BarList({
  items,
  color = 'var(--series-in)',
  formatValue,
}: {
  items: { id: string; value: number }[];
  color?: string;
  formatValue: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <div className="center-state">No data</div>;
  return (
    <div className="barlist">
      {items.map((it) => (
        <div className="barlist-row" key={it.id}>
          <span className="barlist-label" title={it.id}>
            {it.id}
          </span>
          <span className="barlist-val">{formatValue(it.value)}</span>
          <div className="barlist-track">
            <div
              className="barlist-fill"
              style={{ width: `${(it.value / max) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- States -------------------------------------------------------------
export function Loading({ height = 200 }: { height?: number }) {
  return (
    <div className="center-state" style={{ height }}>
      <span className="spinner" />
      Loading…
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner">⚠ {message}</div>;
}

// ---- Key/value list -----------------------------------------------------
export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}
