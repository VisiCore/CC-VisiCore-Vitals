// Human-friendly formatting helpers shared across the app.

/** Format a raw byte count as a human-readable string (e.g. 1.2 GB). */
export function formatBytes(n: number, digits = 1): string {
  if (!isFinite(n) || n === 0) return '0 B';
  const neg = n < 0;
  const abs = Math.abs(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(abs) / Math.log(1024)));
  const val = abs / Math.pow(1024, i);
  return `${neg ? '-' : ''}${val.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

/** Format a large count with K/M/B suffixes (e.g. 1.2M). */
export function formatCount(n: number, digits = 1): string {
  if (!isFinite(n)) return '0';
  const neg = n < 0;
  const abs = Math.abs(n);
  let out: string;
  if (abs >= 1e9) out = `${(abs / 1e9).toFixed(digits)}B`;
  else if (abs >= 1e6) out = `${(abs / 1e6).toFixed(digits)}M`;
  else if (abs >= 1e3) out = `${(abs / 1e3).toFixed(digits)}K`;
  else out = String(Math.round(abs));
  return `${neg ? '-' : ''}${out}`;
}

/** Per-second rate from a total over a window of seconds. */
export function formatRate(total: number, seconds: number, unit: 'events' | 'bytes'): string {
  if (seconds <= 0) return unit === 'bytes' ? '0 B/s' : '0/s';
  const per = total / seconds;
  return unit === 'bytes' ? `${formatBytes(per)}/s` : `${formatCount(per)}/s`;
}

/** Signed percentage string, e.g. +40.4%. */
export function formatPct(fraction: number, digits = 1): string {
  if (!isFinite(fraction)) return '—';
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Data-reduction percentage from in/out bytes (positive = shrinkage). */
export function reductionPct(bytesIn: number, bytesOut: number): number {
  if (bytesIn <= 0) return 0;
  return (bytesIn - bytesOut) / bytesIn;
}

/** Format a millisecond epoch as a short local time (HH:MM). */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Format a millisecond epoch as a short date (Mon D). */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Human duration from seconds (e.g. 3d 4h, 12m). */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

/** Relative "time ago" from a millisecond epoch. */
export function timeAgo(ms: number, nowMs: number): string {
  const diff = Math.max(0, (nowMs - ms) / 1000);
  if (diff < 60) return 'just now';
  return `${formatDuration(diff)} ago`;
}
