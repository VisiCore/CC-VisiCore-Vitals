// Shared data shapes returned by the Cribl REST API (trimmed to what the app uses).

export type Health = 'Green' | 'Yellow' | 'Red' | 'Unknown';

export interface Group {
  id: string;
  name?: string;
  description?: string;
  type: 'stream' | 'edge' | 'search' | 'outpost' | string;
  isFleet?: boolean;
  onPrem?: boolean;
  provisioned?: boolean;
  estimatedIngestRate?: number;
  cloud?: { provider?: string; region?: string };
}

export interface WorkerNode {
  id: string;
  status: string; // "healthy" | ...
  group: string;
  workerProcesses?: number;
  lastMsgTime?: number;
  disconnected?: boolean;
  info: {
    hostname?: string;
    platform?: string;
    architecture?: string;
    cpus?: number;
    totalmem?: number;
    totalDiskSpace?: number;
    freeDiskSpace?: number;
    startTime?: number;
    cribl?: { version?: string; startTime?: number };
  };
}

export interface IOStatus {
  id: string;
  type: string;
  status: {
    timestamp?: number;
    health?: Health;
    healthCounts?: Record<string, number>;
    metrics?: Record<string, number>;
  };
}

/** One time-bucket row from POST /system/metrics/query. */
export interface MetricRow {
  starttime: number; // epoch seconds
  endtime: number; // epoch seconds
  [alias: string]: number | string | undefined;
}

export interface LicenseUsageDay {
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  inBytes: number;
  outBytes: number;
  inEvents: number;
  outEvents: number;
  exemptedLicenseInBytes?: number;
}

export type Severity = 'error' | 'warn' | 'info';

export interface SystemMessage {
  id: string;
  severity: Severity;
  title: string;
  text: string;
  time: number; // epoch ms
  group?: string;
  workerId?: string;
  metadata?: unknown;
}

export interface SystemInfo {
  BUILD?: { VERSION?: string; BRANCH?: string; TIMESTAMP?: string };
  hostname?: string;
  uptime?: number;
  loadavg?: number[];
  memory?: { free?: number; total?: number };
  workerProcesses?: number;
  distMode?: string;
}
