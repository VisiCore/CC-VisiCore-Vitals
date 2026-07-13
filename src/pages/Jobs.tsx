import { useMemo, useState } from 'react';
import { useApp, useGroupIds } from '../state/AppContext';
import { useAsync } from '../hooks/useAsync';
import { getJobs, streamLink, type JobWithGroup } from '../api/client';
import { Card, StatTile, Loading, ErrorBanner, HealthBadge } from '../components/ui';
import { formatBytes, formatCount, timeAgo } from '../lib/format';

type Filter = 'all' | 'failed' | 'running' | 'scheduled';

/** Collector config name — jobs are named `<epoch>.<seq>.<kind>.<collectorId>`. */
function collectorName(j: JobWithGroup): string {
  return j.args?.id ?? j.id.split('.').slice(3).join('.') ?? j.id;
}

function jobKind(j: JobWithGroup): 'scheduled' | 'adhoc' {
  return j.args?.schedule?.cronSchedule || j.id.includes('.scheduled.') ? 'scheduled' : 'adhoc';
}

/** Failed tasks make a "finished" job a failure from an operator's viewpoint. */
function jobState(j: JobWithGroup): string {
  const state = j.status?.state ?? 'unknown';
  if (state === 'finished' && (j.stats?.tasks?.failed ?? 0) > 0) return 'failed tasks';
  return state;
}

function stateHealth(s: string): 'Green' | 'Yellow' | 'Red' {
  if (s === 'failed' || s === 'failed tasks' || s === 'cancelled') return 'Red';
  if (s === 'finished') return 'Green';
  return 'Yellow'; // running / pending / initializing
}

export function Jobs() {
  const { group, tick } = useApp();
  const groupIds = useGroupIds();
  const idKey = groupIds.join(',');

  const jobs = useAsync<JobWithGroup[]>(() => getJobs(groupIds), [idKey, tick]);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(
    () => (jobs.data ?? []).filter((j) => group === 'all' || j.group === group),
    [jobs.data, group],
  );

  const failed = rows.filter((j) => stateHealth(jobState(j)) === 'Red');
  const running = rows.filter((j) => {
    const s = j.status?.state;
    return s === 'running' || s === 'pending' || s === 'initializing';
  });
  const scheduled = rows.filter((j) => jobKind(j) === 'scheduled');
  const totalCollected = rows.reduce((a, j) => a + (j.stats?.collectedEvents ?? 0), 0);

  const shown = useMemo(() => {
    let list = rows;
    if (filter === 'failed') list = failed;
    else if (filter === 'running') list = running;
    else if (filter === 'scheduled') list = scheduled;
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (j) =>
          collectorName(j).toLowerCase().includes(needle) ||
          j.group.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, filter, q, failed, running, scheduled]);

  const now = Date.now();

  return (
    <>
      <div className="grid grid-4">
        <StatTile label="Job Runs" value={String(rows.length)} accent="var(--accent)" />
        <StatTile
          label="Failed"
          value={String(failed.length)}
          accent={failed.length > 0 ? 'var(--critical)' : 'var(--good)'}
          foot={failed.length > 0 ? <span>needs attention</span> : <span>all clean</span>}
        />
        <StatTile label="In Flight" value={String(running.length)} accent="var(--series-in)" />
        <StatTile
          label="Events Collected"
          value={formatCount(totalCollected)}
          accent="var(--series-out)"
        />
      </div>

      <Card
        title="Collection Jobs"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="pill-tabs">
              {(['all', 'failed', 'running', 'scheduled'] as const).map((f) => (
                <button
                  key={f}
                  className={`pill-tab ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
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
        {jobs.loading && !jobs.data ? (
          <Loading />
        ) : jobs.error ? (
          <ErrorBanner message={jobs.error} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="no-sort">Collector</th>
                  <th className="no-sort">Group</th>
                  <th className="no-sort">Kind</th>
                  <th className="no-sort">State</th>
                  <th className="no-sort num">Tasks</th>
                  <th className="no-sort num">Failed</th>
                  <th className="no-sort num">Events</th>
                  <th className="no-sort num">Bytes</th>
                  <th className="no-sort">Started</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => {
                  const state = jobState(j);
                  const tasks = j.stats?.tasks;
                  const startedMs = j.stats?.state?.initializing ?? 0;
                  const cron = j.args?.schedule?.cronSchedule;
                  return (
                    <tr key={`${j.group}:${j.id}`}>
                      <td className="id-cell" title={j.id}>
                        {collectorName(j)}
                      </td>
                      <td>
                        <span className="type-chip">{j.group}</span>
                      </td>
                      <td className="muted" title={cron ? `cron: ${cron}` : undefined}>
                        {jobKind(j)}
                        {cron ? ` (${cron})` : ''}
                      </td>
                      <td>
                        <HealthBadge health={stateHealth(state)} label={state} />
                      </td>
                      <td className="num">{tasks?.count ?? '—'}</td>
                      <td className={`num ${(tasks?.failed ?? 0) > 0 ? 'delta-down' : ''}`}>
                        {tasks?.failed || '—'}
                      </td>
                      <td className="num">
                        {j.stats?.collectedEvents ? formatCount(j.stats.collectedEvents) : '—'}
                      </td>
                      <td className="num">
                        {j.stats?.collectedBytes ? formatBytes(j.stats.collectedBytes) : '—'}
                      </td>
                      <td className="muted">{startedMs ? timeAgo(startedMs, now) : '—'}</td>
                      <td>
                        {streamLink('job', j.group) && (
                          <a
                            className="btn btn-sm"
                            href={streamLink('job', j.group)}
                            target="_top"
                            rel="noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            Open ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                      {rows.length === 0
                        ? 'No collection jobs found for this selection.'
                        : 'No matches'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
