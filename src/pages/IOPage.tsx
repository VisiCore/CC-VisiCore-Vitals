import { Fragment, useMemo, useState } from 'react';
import { useApp, useGroupIds } from '../state/AppContext';
import { useAsync } from '../hooks/useAsync';
import {
  getInputStatuses,
  getOutputStatuses,
  getTopInputs,
  getTopOutputs,
  getMessages,
  getOutputPQStats,
  streamLink,
  type TopItem,
  type IOStatusWithGroup,
  type OutputPQStat,
} from '../api/client';
import type { SystemMessage } from '../api/types';
import { Card, StatTile, Loading, ErrorBanner, HealthBadge } from '../components/ui';
import { HealthDonut } from '../components/charts/HealthDonut';
import { countHealth, normHealth } from '../lib/metrics';
import { formatBytes, formatCount, formatTime } from '../lib/format';

interface Row {
  id: string;
  group: string;
  type: string;
  health: string | undefined;
  bytes: number;
  events: number;
  dropped: number;
  /** Current persistent-queue depth in bytes (destinations only). */
  pqBytes: number;
  /** 2 = backpressure engaged now, 1 = engaged earlier in window, 0 = none. */
  bpState: number;
  pq?: OutputPQStat;
  metrics: Record<string, number>;
  timestamp?: number;
  message?: string;
}

type SortKey = 'id' | 'group' | 'type' | 'health' | 'bytes' | 'events' | 'dropped' | 'pqBytes' | 'bpState';
const HEALTH_ORDER: Record<string, number> = { Red: 0, Yellow: 1, Green: 2, Unknown: 3 };

export function IOPage({ kind }: { kind: 'source' | 'destination' }) {
  const { group, range, tick } = useApp();
  const groupIds = useGroupIds();
  const idKey = groupIds.join(',');
  const isSource = kind === 'source';

  const status = useAsync<IOStatusWithGroup[]>(
    () => (isSource ? getInputStatuses(groupIds) : getOutputStatuses(groupIds)),
    [idKey, tick, kind],
  );
  const tops = useAsync<TopItem[]>(
    () => (isSource ? getTopInputs(group, range.rangeSeconds) : getTopOutputs(group, range.rangeSeconds)),
    [group, range.id, tick, kind],
  );
  const msgs = useAsync<SystemMessage[]>(() => getMessages(), [tick]);
  // Backpressure & persistent-queue stats only exist for destinations.
  const pqStats = useAsync<OutputPQStat[]>(
    () => (isSource ? Promise.resolve([]) : getOutputPQStats(group, range.rangeSeconds, range.bucketSeconds)),
    [group, range.id, tick, kind],
  );

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'Red' | 'Yellow' | 'Green'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'bytes', dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Correlate an IO item with system notifications that name it. Match the id as a
  // quoted token (e.g. Failed to initialize Source "win-data-gen") in the same group
  // (or an ungrouped/global message) to avoid false substring hits.
  function relatedMessages(id: string, grp: string): SystemMessage[] {
    const quoted = `"${id}"`;
    return (msgs.data ?? []).filter(
      (m) =>
        (m.severity === 'error' || m.severity === 'warn') &&
        (m.group === grp || !m.group) &&
        ((m.title ?? '').includes(quoted) || (m.text ?? '').includes(quoted)),
    );
  }

  const volById = useMemo(() => {
    const m = new Map<string, TopItem>();
    for (const t of tops.data ?? []) m.set(t.id, t);
    return m;
  }, [tops.data]);

  const pqByKey = useMemo(() => {
    const m = new Map<string, OutputPQStat>();
    for (const s of pqStats.data ?? []) m.set(`${s.group}::${s.id}`, s);
    return m;
  }, [pqStats.data]);

  const rows: Row[] = useMemo(() => {
    const list = (status.data ?? []).map((s) => {
      const v = volById.get(s.id);
      const pq = pqByKey.get(`${s.group}::${s.id}`);
      return {
        id: s.id,
        group: s.group,
        type: s.type,
        health: s.status?.health,
        bytes: v?.bytes ?? 0,
        events: v?.events ?? 0,
        dropped: Number(s.status?.metrics?.numDropped ?? 0),
        pqBytes: pq?.pqBytes ?? 0,
        bpState: pq?.backpressureNow ? 2 : pq && pq.backpressureBuckets > 0 ? 1 : 0,
        pq,
        metrics: s.status?.metrics ?? {},
        timestamp: s.status?.timestamp,
        message: (s.status as { message?: string })?.message,
      };
    });
    return list;
  }, [status.data, volById, pqByKey]);

  const counts = countHealth(rows.map((r) => r.health));

  const shown = useMemo(() => {
    let list = rows;
    if (filter !== 'all') list = list.filter((r) => normHealth(r.health) === filter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((r) => r.id.toLowerCase().includes(needle) || r.type.toLowerCase().includes(needle));
    }
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      let c: number;
      if (key === 'id' || key === 'type' || key === 'group') c = a[key].localeCompare(b[key]);
      else if (key === 'health') c = HEALTH_ORDER[normHealth(a.health)] - HEALTH_ORDER[normHealth(b.health)];
      else c = a[key] - b[key];
      return c * dir;
    });
  }, [rows, filter, q, sort]);

  function th(key: SortKey, label: string, numeric = false) {
    const activeSort = sort.key === key;
    return (
      <th
        className={numeric ? 'num' : ''}
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === -1 ? 1 : -1 }))}
      >
        {label}
        {activeSort && <span className="arrow">{sort.dir === -1 ? '▾' : '▴'}</span>}
      </th>
    );
  }

  const volLabel = isSource ? 'Volume In' : 'Volume Out';
  const totalVol = rows.reduce((a, r) => a + r.bytes, 0);
  const bpNow = rows.filter((r) => r.bpState === 2).length;
  const totalPQ = rows.reduce((a, r) => a + r.pqBytes, 0);

  return (
    <>
      <div className="grid grid-4">
        <StatTile
          label={`Total ${isSource ? 'Sources' : 'Destinations'}`}
          value={String(counts.total)}
          accent="var(--accent)"
        />
        <StatTile label="Healthy" value={String(counts.Green)} accent="var(--good)" />
        <StatTile
          label="Unhealthy"
          value={String(counts.Red)}
          accent={counts.Red > 0 ? 'var(--critical)' : 'var(--good)'}
          foot={counts.Yellow > 0 ? <span>{counts.Yellow} warning</span> : undefined}
        />
        {isSource ? (
          <StatTile label={volLabel} value={formatBytes(totalVol)} accent="var(--series-in)" />
        ) : (
          <StatTile
            label="Backpressured"
            value={String(bpNow)}
            accent={bpNow > 0 ? 'var(--critical)' : 'var(--good)'}
            foot={
              totalPQ > 0 ? (
                <span>{formatBytes(totalPQ)} queued to disk</span>
              ) : (
                <span>{formatBytes(totalVol)} delivered</span>
              )
            }
          />
        )}
      </div>

      <div className="grid grid-3">
        <Card title="Health Distribution">
          {status.loading && !status.data ? <Loading height={150} /> : <HealthDonut counts={counts} />}
        </Card>
        <Card
          title={`${isSource ? 'Sources' : 'Destinations'}`}
          className="col-span-2"
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="pill-tabs">
                {(['all', 'Red', 'Yellow', 'Green'] as const).map((f) => (
                  <button
                    key={f}
                    className={`pill-tab ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'Red' ? 'Unhealthy' : f === 'Yellow' ? 'Warning' : 'Healthy'}
                  </button>
                ))}
              </div>
              <input
                className="select"
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ width: 140 }}
              />
            </div>
          }
        >
          {status.loading && !status.data ? (
            <Loading />
          ) : status.error ? (
            <ErrorBanner message={status.error} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {th('id', 'ID')}
                    {th('group', 'Group')}
                    {th('type', 'Type')}
                    {th('health', 'Health')}
                    {th('bytes', volLabel, true)}
                    {th('events', 'Events', true)}
                    {!isSource && th('dropped', 'Dropped', true)}
                    {!isSource && th('pqBytes', 'PQ Depth', true)}
                    {!isSource && th('bpState', 'Backpressure')}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const rowKey = `${r.group}:${r.id}`;
                    const isOpen = open.has(rowKey);
                    const metricEntries = Object.entries(r.metrics).filter(
                      ([, v]) => typeof v === 'number',
                    );
                    return (
                      <Fragment key={rowKey}>
                        <tr className="row-expandable" onClick={() => toggle(rowKey)}>
                          <td className="id-cell" title={r.id}>
                            <span className={`row-caret ${isOpen ? 'open' : ''}`}>▶</span>
                            {r.id}
                          </td>
                          <td className="muted">{r.group}</td>
                          <td>
                            <span className="type-chip">{r.type}</span>
                          </td>
                          <td>
                            <HealthBadge health={r.health} />
                          </td>
                          <td className="num">{formatBytes(r.bytes)}</td>
                          <td className="num">{formatCount(r.events)}</td>
                          {!isSource && (
                            <td className={`num ${r.dropped > 0 ? 'delta-down' : ''}`}>
                              {r.dropped > 0 ? formatCount(r.dropped) : '—'}
                            </td>
                          )}
                          {!isSource && (
                            <td
                              className={`num ${r.pqBytes > 0 ? 'delta-down' : ''}`}
                              title={r.pq ? `Peak in window: ${formatBytes(r.pq.pqPeakBytes)}` : undefined}
                            >
                              {r.pqBytes > 0 ? formatBytes(r.pqBytes) : '—'}
                            </td>
                          )}
                          {!isSource && (
                            <td>
                              {r.bpState === 2 ? (
                                <HealthBadge health="Red" label="Engaged" />
                              ) : r.bpState === 1 ? (
                                <HealthBadge health="Yellow" label="Earlier" />
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                        {isOpen && (
                          <tr>
                            <td className="detail-cell" colSpan={isSource ? 6 : 9}>
                              <div className="detail-grid">
                                <div>
                                  <div className="dk">Health</div>
                                  <div className="dv">{normHealth(r.health)}</div>
                                </div>
                                <div>
                                  <div className="dk">Group</div>
                                  <div className="dv">{r.group}</div>
                                </div>
                                <div>
                                  <div className="dk">Type</div>
                                  <div className="dv">{r.type}</div>
                                </div>
                                <div>
                                  <div className="dk">Last update</div>
                                  <div className="dv">
                                    {r.timestamp ? formatTime(r.timestamp) : '—'}
                                  </div>
                                </div>
                                {!isSource && r.pq && (
                                  <>
                                    <div>
                                      <div className="dk">PQ depth (peak)</div>
                                      <div className="dv">
                                        {formatBytes(r.pq.pqBytes)} ({formatBytes(r.pq.pqPeakBytes)})
                                      </div>
                                    </div>
                                    <div>
                                      <div className="dk">Backpressure buckets</div>
                                      <div className="dv">{r.pq.backpressureBuckets}</div>
                                    </div>
                                  </>
                                )}
                                {metricEntries.map(([k, v]) => (
                                  <div key={k}>
                                    <div className="dk">{k}</div>
                                    <div className="dv">
                                      {/byte/i.test(k)
                                        ? formatBytes(v)
                                        : v.toLocaleString()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {(() => {
                                const related = normHealth(r.health) === 'Green' ? [] : relatedMessages(r.id, r.group);
                                const showWhy = normHealth(r.health) !== 'Green';
                                return (
                                  <div style={{ padding: '0 16px 14px 34px' }}>
                                    {r.message && <pre className="detail-pre">{r.message}</pre>}
                                    {showWhy && (
                                      <>
                                        <div className="section-title" style={{ margin: '2px 0 8px' }}>
                                          Related Notifications
                                        </div>
                                        {related.length > 0 ? (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {related.map((m, i) => (
                                              <div
                                                key={i}
                                                style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}
                                              >
                                                <span
                                                  className={`sev ${m.severity === 'error' ? 'sev-error' : 'sev-warn'}`}
                                                  style={{ marginTop: 1 }}
                                                >
                                                  {m.severity === 'error' ? 'Error' : 'Warn'}
                                                </span>
                                                <span style={{ fontSize: 13 }}>{m.text || m.title}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="muted" style={{ fontSize: 12.5 }}>
                                            No system notification recorded for this{' '}
                                            {isSource ? 'source' : 'destination'}. It is reporting{' '}
                                            <strong>{normHealth(r.health)}</strong> health with no
                                            recent throughput — check its connectivity and
                                            configuration in Cribl Stream.
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                              <div style={{ padding: '2px 16px 14px 34px' }}>
                                <a
                                  className="btn"
                                  href={streamLink(kind, r.group) || '#'}
                                  target="_top"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ textDecoration: 'none' }}
                                >
                                  Open {isSource ? 'Source' : 'Destination'} in Cribl Stream ↗
                                </a>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={isSource ? 6 : 9} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                        No matches
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
