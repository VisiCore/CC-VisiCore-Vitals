import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { useAsync } from '../hooks/useAsync';
import { getMessages } from '../api/client';
import type { Severity, SystemMessage } from '../api/types';
import { Card, StatTile, Loading, ErrorBanner } from '../components/ui';
import { IconChevron } from '../components/icons';
import { timeAgo } from '../lib/format';

const SEV_LABEL: Record<Severity, string> = { error: 'Error', warn: 'Warn', info: 'Info' };
const SEV_CLASS: Record<Severity, string> = {
  error: 'sev-error',
  warn: 'sev-warn',
  info: 'sev-info',
};
const SEV_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

function normSev(s: string): Severity {
  return s === 'error' || s === 'warn' ? s : 'info';
}

export function Notifications() {
  const { tick } = useApp();
  const msgs = useAsync(() => getMessages(), [tick]);
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const now = Date.now();

  const all = msgs.data ?? [];
  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    for (const m of all) c[normSev(m.severity)]++;
    return c;
  }, [all]);

  const shown = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((m) => normSev(m.severity) === filter);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (m) =>
          (m.title ?? '').toLowerCase().includes(n) ||
          (m.text ?? '').toLowerCase().includes(n) ||
          (m.group ?? '').toLowerCase().includes(n),
      );
    }
    return [...list].sort((a, b) => {
      const s = SEV_ORDER[normSev(a.severity)] - SEV_ORDER[normSev(b.severity)];
      return s !== 0 ? s : (b.time ?? 0) - (a.time ?? 0);
    });
  }, [all, filter, q]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const detail = (m: SystemMessage) => {
    const meta =
      m.metadata && (Array.isArray(m.metadata) ? m.metadata.length : true)
        ? `\n\nmetadata: ${JSON.stringify(m.metadata, null, 2)}`
        : '';
    return `${m.text || m.title}${meta}`;
  };

  return (
    <>
      <div className="grid grid-3">
        <StatTile
          label="Errors"
          value={String(counts.error)}
          accent={counts.error > 0 ? 'var(--critical)' : 'var(--good)'}
        />
        <StatTile
          label="Warnings"
          value={String(counts.warn)}
          accent={counts.warn > 0 ? 'var(--warning)' : 'var(--good)'}
        />
        <StatTile label="Info" value={String(counts.info)} accent="var(--accent)" />
      </div>

      <Card
        title="System Notifications"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="pill-tabs">
              {(['all', 'error', 'warn', 'info'] as const).map((f) => (
                <button
                  key={f}
                  className={`pill-tab ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : `${SEV_LABEL[f]}s`}
                </button>
              ))}
            </div>
            <input
              className="select"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 150 }}
            />
          </div>
        }
      >
        {msgs.loading && !msgs.data ? (
          <Loading />
        ) : msgs.error ? (
          <ErrorBanner message={msgs.error} />
        ) : shown.length === 0 ? (
          <div className="center-state">No notifications match</div>
        ) : (
          <div className="notif">
            {shown.map((m) => {
              const sev = normSev(m.severity);
              const isOpen = open.has(m.id);
              return (
                <div className="notif-row" key={m.id}>
                  <div className="notif-head" onClick={() => toggle(m.id)}>
                    <IconChevron className={`notif-chevron ${isOpen ? 'open' : ''}`} />
                    <span className={`sev ${SEV_CLASS[sev]}`}>{SEV_LABEL[sev]}</span>
                    <span className="notif-title">{m.title || m.text}</span>
                    {m.group && <span className="type-chip">{m.group}</span>}
                    <span className="notif-meta">{m.time ? timeAgo(m.time, now) : ''}</span>
                  </div>
                  {isOpen && (
                    <div className="notif-body">
                      <pre className="detail-pre">{detail(m)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
