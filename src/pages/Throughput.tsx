import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { useAsync } from '../hooks/useAsync';
import { getThroughputSeries, getDroppedSeries, getGroupTotals } from '../api/client';
import type { MetricRow } from '../api/types';
import { Card, StatTile, Loading, ErrorBanner } from '../components/ui';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { toPoints, sumAlias } from '../lib/metrics';
import { formatBytes, formatCount, formatPct, reductionPct } from '../lib/format';

interface GroupTotal {
  id: string;
  eventsIn: number;
  eventsOut: number;
  bytesIn: number;
  bytesOut: number;
}

function rollupByGroup(rows: MetricRow[]): GroupTotal[] {
  const m = new Map<string, GroupTotal>();
  for (const r of rows) {
    const id = (r.__worker_group as string) ?? '(none)';
    const cur = m.get(id) ?? { id, eventsIn: 0, eventsOut: 0, bytesIn: 0, bytesOut: 0 };
    cur.eventsIn += Number(r.eventsIn ?? 0);
    cur.eventsOut += Number(r.eventsOut ?? 0);
    cur.bytesIn += Number(r.bytesIn ?? 0);
    cur.bytesOut += Number(r.bytesOut ?? 0);
    m.set(id, cur);
  }
  return [...m.values()].filter((g) => g.bytesIn > 0 || g.bytesOut > 0).sort((a, b) => b.bytesIn - a.bytesIn);
}

export function Throughput() {
  const { group, range, tick } = useApp();
  const [metric, setMetric] = useState<'events' | 'bytes'>('bytes');

  const tp = useAsync(
    () => getThroughputSeries(group, range.rangeSeconds, range.bucketSeconds),
    [group, range.id, tick],
  );
  const dropped = useAsync(
    () => getDroppedSeries(group, range.rangeSeconds, range.bucketSeconds),
    [group, range.id, tick],
  );
  const totals = useAsync(() => getGroupTotals(range.rangeSeconds), [range.id, tick]);

  const rows = tp.data ?? [];
  const dropRows = dropped.data ?? [];
  const eventsIn = sumAlias(rows, 'eventsIn');
  const eventsOut = sumAlias(rows, 'eventsOut');
  const bytesIn = sumAlias(rows, 'bytesIn');
  const bytesOut = sumAlias(rows, 'bytesOut');
  const totalDropped = sumAlias(dropRows, 'dropped');

  const groupTotals = useMemo(() => rollupByGroup(totals.data ?? []), [totals.data]);
  const dateAxis = range.rangeSeconds > 86400;

  const isBytes = metric === 'bytes';
  const fmt = isBytes ? formatBytes : formatCount;

  return (
    <>
      <div className="grid grid-4">
        <StatTile label="Events In" value={formatCount(eventsIn)} accent="var(--series-in)" />
        <StatTile label="Events Out" value={formatCount(eventsOut)} accent="var(--series-out)" />
        <StatTile
          label="Data Reduction"
          value={formatPct(reductionPct(bytesIn, bytesOut))}
          accent="var(--good)"
          foot={<span>{formatBytes(bytesIn)} → {formatBytes(bytesOut)}</span>}
        />
        <StatTile
          label="Dropped Events"
          value={formatCount(totalDropped)}
          accent={totalDropped > 0 ? 'var(--warning)' : 'var(--good)'}
          foot={<span>{totalDropped > 0 ? 'review filters / backpressure' : 'none dropped'}</span>}
        />
      </div>

      <Card
        title={`Throughput — ${isBytes ? 'bytes' : 'events'} in / out`}
        right={
          <div className="pill-tabs">
            <button
              className={`pill-tab ${isBytes ? 'active' : ''}`}
              onClick={() => setMetric('bytes')}
            >
              Bytes
            </button>
            <button
              className={`pill-tab ${!isBytes ? 'active' : ''}`}
              onClick={() => setMetric('events')}
            >
              Events
            </button>
          </div>
        }
      >
        {tp.loading && !tp.data ? (
          <Loading height={280} />
        ) : tp.error ? (
          <ErrorBanner message={tp.error} />
        ) : (
          <TimeSeriesChart
            height={300}
            valueFormat={fmt}
            dateAxis={dateAxis}
            series={[
              {
                name: isBytes ? 'Bytes In' : 'Events In',
                color: 'var(--series-in)',
                points: toPoints(rows, isBytes ? 'bytesIn' : 'eventsIn'),
              },
              {
                name: isBytes ? 'Bytes Out' : 'Events Out',
                color: 'var(--series-out)',
                points: toPoints(rows, isBytes ? 'bytesOut' : 'eventsOut'),
              },
            ]}
          />
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="Dropped Events" note={range.label}>
          {dropped.loading && !dropped.data ? (
            <Loading />
          ) : (
            <TimeSeriesChart
              height={200}
              valueFormat={formatCount}
              dateAxis={dateAxis}
              series={[
                { name: 'Dropped', color: 'var(--series-drop)', points: toPoints(dropRows, 'dropped') },
              ]}
            />
          )}
        </Card>

        <Card title="Volume by Group" note="last 24h">
          {totals.loading && !totals.data ? (
            <Loading />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="no-sort">Group</th>
                    <th className="no-sort num">In</th>
                    <th className="no-sort num">Out</th>
                    <th className="no-sort num">Reduction</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTotals.map((g) => {
                    const red = reductionPct(g.bytesIn, g.bytesOut);
                    return (
                      <tr key={g.id}>
                        <td className="id-cell">{g.id}</td>
                        <td className="num">{formatBytes(g.bytesIn)}</td>
                        <td className="num">{formatBytes(g.bytesOut)}</td>
                        <td className={`num ${red >= 0 ? 'delta-up' : 'delta-down'}`}>
                          {formatPct(red)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
