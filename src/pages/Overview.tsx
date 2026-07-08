import { useApp, useGroupIds } from '../state/AppContext';
import { useAsync } from '../hooks/useAsync';
import {
  getThroughputSeries,
  getInputStatuses,
  getOutputStatuses,
  getTopInputs,
  getTopOutputs,
  getWorkers,
  getMessages,
} from '../api/client';
import { Card, StatTile, BarList, Loading, ErrorBanner, HealthBadge, Meter } from '../components/ui';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { HealthDonut } from '../components/charts/HealthDonut';
import { toPoints, sumAlias, countHealth } from '../lib/metrics';
import { formatBytes, formatCount, formatPct, reductionPct } from '../lib/format';

export function Overview() {
  const { group, range, tick } = useApp();
  const groupIds = useGroupIds();
  const idKey = groupIds.join(',');

  const tp = useAsync(
    () => getThroughputSeries(group, range.rangeSeconds, range.bucketSeconds),
    [group, range.id, tick],
  );
  const status = useAsync(
    () => Promise.all([getInputStatuses(groupIds), getOutputStatuses(groupIds)]),
    [idKey, tick],
  );
  const topIn = useAsync(() => getTopInputs(group, range.rangeSeconds), [group, range.id, tick]);
  const topOut = useAsync(() => getTopOutputs(group, range.rangeSeconds), [group, range.id, tick]);
  const workers = useAsync(() => getWorkers(), [tick]);
  const messages = useAsync(() => getMessages(), [tick]);

  const rows = tp.data ?? [];
  const bytesIn = sumAlias(rows, 'bytesIn');
  const bytesOut = sumAlias(rows, 'bytesOut');
  const eventsIn = sumAlias(rows, 'eventsIn');
  const reduction = reductionPct(bytesIn, bytesOut);

  const [inputs, outputs] = status.data ?? [[], []];
  const srcHealth = countHealth(inputs.map((s) => s.status?.health));
  const dstHealth = countHealth(outputs.map((s) => s.status?.health));

  const nodes = (workers.data ?? []).filter((w) =>
    group === 'all' ? true : w.group === group,
  );
  const healthyNodes = nodes.filter((w) => w.status === 'healthy' && !w.disconnected).length;

  const msgList = messages.data ?? [];
  const errCount = msgList.filter((m) => m.severity === 'error').length;
  const warnCount = msgList.filter((m) => m.severity === 'warn').length;

  const secs = range.rangeSeconds;

  return (
    <>
      <div className="grid grid-4">
        <StatTile
          label="Data In"
          value={formatBytes(bytesIn)}
          accent="var(--series-in)"
          foot={<span>{formatCount(eventsIn)} events · {formatBytes(bytesIn / secs)}/s</span>}
        />
        <StatTile
          label="Data Out"
          value={formatBytes(bytesOut)}
          accent="var(--series-out)"
          foot={<span>{formatBytes(bytesOut / secs)}/s avg</span>}
        />
        <StatTile
          label="Data Reduction"
          value={formatPct(reduction, 1)}
          accent={reduction >= 0 ? 'var(--good)' : 'var(--warning)'}
          delta={{
            text: `${formatBytes(Math.abs(bytesIn - bytesOut))} ${
              reduction >= 0 ? 'removed' : 'added by clones'
            }`,
            dir: reduction > 0 ? 'up' : reduction < 0 ? 'down' : 'flat',
          }}
          foot={<span>in → out, this window</span>}
        />
        <StatTile
          label="Healthy Nodes"
          value={`${healthyNodes}/${nodes.length || 0}`}
          accent={
            errCount > 0 || srcHealth.Red + dstHealth.Red > 0
              ? 'var(--critical)'
              : warnCount > 0
                ? 'var(--warning)'
                : 'var(--good)'
          }
          foot={
            <span>
              {srcHealth.Red + dstHealth.Red} unhealthy IO · {errCount} err · {warnCount} warn
            </span>
          }
        />
      </div>

      <div className="grid grid-3">
        <Card title="Throughput (bytes in / out)" className="col-span-2" note={range.label}>
          {tp.loading && !tp.data ? (
            <Loading />
          ) : tp.error ? (
            <ErrorBanner message={tp.error} />
          ) : (
            <TimeSeriesChart
              height={240}
              valueFormat={formatBytes}
              dateAxis={range.rangeSeconds > 86400}
              series={[
                { name: 'Bytes In', color: 'var(--series-in)', points: toPoints(rows, 'bytesIn') },
                { name: 'Bytes Out', color: 'var(--series-out)', points: toPoints(rows, 'bytesOut') },
              ]}
            />
          )}
        </Card>

        <Card title="I/O Health">
          {status.loading && !status.data ? (
            <Loading height={240} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 10 }}>
                  Sources
                </div>
                <HealthDonut counts={srcHealth} size={120} />
              </div>
              <div>
                <div className="section-title" style={{ marginBottom: 10 }}>
                  Destinations
                </div>
                <HealthDonut counts={dstHealth} size={120} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Top Sources" note="by volume in">
          {topIn.loading && !topIn.data ? (
            <Loading />
          ) : (
            <BarList
              color="var(--series-in)"
              formatValue={formatBytes}
              items={(topIn.data ?? []).slice(0, 8).map((s) => ({ id: s.id, value: s.bytes }))}
            />
          )}
        </Card>
        <Card title="Top Destinations" note="by volume out">
          {topOut.loading && !topOut.data ? (
            <Loading />
          ) : (
            <BarList
              color="var(--series-out)"
              formatValue={formatBytes}
              items={(topOut.data ?? []).slice(0, 8).map((s) => ({ id: s.id, value: s.bytes }))}
            />
          )}
        </Card>
      </div>

      <Card title="Worker & Edge Nodes" note={`${nodes.length} node${nodes.length === 1 ? '' : 's'}`}>
        {workers.loading && !workers.data ? (
          <Loading />
        ) : nodes.length === 0 ? (
          <div className="center-state">No connected nodes for this selection</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="no-sort">Host</th>
                  <th className="no-sort">Group</th>
                  <th className="no-sort">Status</th>
                  <th className="no-sort">CPUs</th>
                  <th className="no-sort">Memory</th>
                  <th className="no-sort" style={{ width: 160 }}>
                    Disk
                  </th>
                  <th className="no-sort">Version</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((w) => {
                  const disk =
                    w.info.totalDiskSpace && w.info.freeDiskSpace
                      ? (1 - w.info.freeDiskSpace / w.info.totalDiskSpace) * 100
                      : 0;
                  return (
                    <tr key={w.id}>
                      <td className="id-cell">{w.info.hostname ?? w.id.slice(0, 12)}</td>
                      <td>
                        <span className="type-chip">{w.group}</span>
                      </td>
                      <td>
                        <HealthBadge
                          health={w.status === 'healthy' && !w.disconnected ? 'Green' : 'Red'}
                          label={w.disconnected ? 'Disconnected' : w.status}
                        />
                      </td>
                      <td className="mono">{w.info.cpus ?? '—'}</td>
                      <td className="mono">{w.info.totalmem ? formatBytes(w.info.totalmem) : '—'}</td>
                      <td>
                        <Meter pct={disk} />
                      </td>
                      <td className="mono muted">{w.info.cribl?.version ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
