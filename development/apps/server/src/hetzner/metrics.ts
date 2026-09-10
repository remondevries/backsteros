/**
 * Server metrics for Observe → Metrics.
 * CPU / network / disk I/O come from Hetzner Cloud API.
 * Memory % and disk usage % come from SSH guest samples (API has no guest gauges).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getServer, fetchServerCloudMetrics } from "./cloud.ts";
import { findHetznerServer } from "./server-connection.ts";
import { evaluateServerMonitors } from "./monitors.ts";
import { normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";

export const METRIC_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type MetricRange = (typeof METRIC_RANGES)[number];

export function isMetricRange(value: unknown): value is MetricRange {
  return typeof value === "string" && (METRIC_RANGES as readonly string[]).includes(value);
}

export type MetricPoint = {
  readonly t: number;
  readonly v: number;
};

export type MetricSeries = {
  readonly id: string;
  readonly label: string;
  readonly unit: "percent" | "mbps";
  readonly color: string;
  readonly current: number | null;
  readonly points: readonly MetricPoint[];
  readonly source: "hetzner" | "guest" | "docker";
};

export type ServerMetricsPayload = {
  readonly serverId: string;
  readonly serverName: string;
  readonly range: MetricRange;
  readonly start: string;
  readonly end: string;
  readonly series: readonly MetricSeries[];
  readonly service?: string | null;
};

type GuestSample = {
  readonly at: string;
  readonly memoryPercent: number;
  readonly diskPercent: number;
};

type GuestSamplesFile = {
  readonly servers: Record<string, { readonly samples: GuestSample[] }>;
};

const RANGE_MS: Record<MetricRange, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const SAMPLE_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;
const SAMPLE_MIN_INTERVAL_MS = 45_000;
const APP_SAMPLE_MIN_INTERVAL_MS = 15_000;

function samplesFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "server-metric-samples.json");
}

function readSamplesFile(): GuestSamplesFile {
  try {
    const raw = fs.readFileSync(samplesFilePath(), "utf8");
    const parsed = JSON.parse(raw) as GuestSamplesFile;
    if (!parsed || typeof parsed !== "object" || !parsed.servers) {
      return { servers: {} };
    }
    return parsed;
  } catch {
    return { servers: {} };
  }
}

function writeSamplesFile(file: GuestSamplesFile): void {
  const dir = path.dirname(samplesFilePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(samplesFilePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function parseSeriesValues(
  values: readonly (readonly [number, string])[] | undefined,
): MetricPoint[] {
  if (!values?.length) return [];
  const points: MetricPoint[] = [];
  for (const entry of values) {
    const t = Number(entry[0]);
    const v = Number(entry[1]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    points.push({ t: t * 1000, v });
  }
  return points;
}

function bytesPerSecToMbps(points: readonly MetricPoint[]): MetricPoint[] {
  return points.map((point) => ({ t: point.t, v: (point.v * 8) / 1_000_000 }));
}

function lastValue(points: readonly MetricPoint[]): number | null {
  if (points.length === 0) return null;
  return points[points.length - 1]?.v ?? null;
}

async function sampleGuestMetrics(ip: string): Promise<GuestSample | null> {
  try {
    const raw = await sshExec(
      ip,
      [
        "python3 - <<'PY'",
        "import os",
        "meminfo = {}",
        "with open('/proc/meminfo') as f:",
        "    for line in f:",
        "        key, value = line.split(':', 1)",
        "        meminfo[key] = int(value.strip().split()[0])",
        "total = meminfo.get('MemTotal', 0)",
        "available = meminfo.get('MemAvailable', meminfo.get('MemFree', 0))",
        "used = max(total - available, 0)",
        "memory = (used / total * 100.0) if total else 0.0",
        "st = os.statvfs('/')",
        "disk_total = st.f_blocks * st.f_frsize",
        "disk_free = st.f_bavail * st.f_frsize",
        "disk_used = max(disk_total - disk_free, 0)",
        "disk = (disk_used / disk_total * 100.0) if disk_total else 0.0",
        "print(f'{memory:.4f} {disk:.4f}')",
        "PY",
      ].join("\n"),
      { timeoutMs: 20_000 },
    );
    const [memoryRaw, diskRaw] = raw.trim().split(/\s+/u);
    const memoryPercent = Number(memoryRaw);
    const diskPercent = Number(diskRaw);
    if (!Number.isFinite(memoryPercent) || !Number.isFinite(diskPercent)) return null;
    return {
      at: new Date().toISOString(),
      memoryPercent,
      diskPercent,
    };
  } catch {
    return null;
  }
}

function upsertGuestSample(serverId: string, sample: GuestSample): GuestSample[] {
  const file = readSamplesFile();
  const existing = file.servers[serverId]?.samples ?? [];
  const last = existing[existing.length - 1];
  const sampleAt = Date.parse(sample.at);
  const lastAt = last ? Date.parse(last.at) : 0;
  const nextSamples =
    Number.isFinite(lastAt) && sampleAt - lastAt < SAMPLE_MIN_INTERVAL_MS
      ? [...existing.slice(0, -1), sample]
      : [...existing, sample];

  const cutoff = Date.now() - SAMPLE_RETENTION_MS;
  const pruned = nextSamples.filter((entry) => Date.parse(entry.at) >= cutoff);
  writeSamplesFile({
    servers: {
      ...file.servers,
      [serverId]: { samples: pruned },
    },
  });
  return pruned;
}

function guestSeriesFromSamples(
  samples: readonly GuestSample[],
  startMs: number,
  endMs: number,
  key: "memoryPercent" | "diskPercent",
  meta: Pick<MetricSeries, "id" | "label" | "color">,
): MetricSeries {
  const filterEnd = Math.max(endMs, Date.now()) + 60_000;
  const points = samples
    .map((sample) => {
      const t = Date.parse(sample.at);
      if (!Number.isFinite(t) || t < startMs || t > filterEnd) return null;
      return { t, v: sample[key] } satisfies MetricPoint;
    })
    .filter((point): point is MetricPoint => point != null);

  return {
    ...meta,
    unit: "percent",
    current: lastValue(points) ?? samples.at(-1)?.[key] ?? null,
    points,
    source: "guest",
  };
}

export async function loadServerMetrics(
  serverId: string,
  range: MetricRange,
): Promise<ServerMetricsPayload> {
  const server = (await findHetznerServer(serverId)) ?? (await getServer(serverId));
  const endMs = Date.now();
  const startMs = endMs - RANGE_MS[range];
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  const metricsPromise = fetchServerCloudMetrics(String(server.id), {
    type: "cpu,disk,network",
    start: startIso,
    end: endIso,
  });

  const ip = server.public_net.ipv4?.ip ?? null;
  const guestPromise = ip ? sampleGuestMetrics(ip) : Promise.resolve(null);

  const [metrics, guestSample] = await Promise.all([metricsPromise, guestPromise]);
  const timeSeries = metrics.metrics.time_series ?? {};

  const cpuPoints = parseSeriesValues(timeSeries.cpu?.values);
  const inboundPoints = bytesPerSecToMbps(
    parseSeriesValues(timeSeries["network.0.bandwidth.in"]?.values),
  );
  const outboundPoints = bytesPerSecToMbps(
    parseSeriesValues(timeSeries["network.0.bandwidth.out"]?.values),
  );

  let guestSamples = readSamplesFile().servers[String(server.id)]?.samples ?? [];
  if (guestSample) {
    guestSamples = upsertGuestSample(String(server.id), guestSample);
  }

  const series: MetricSeries[] = [
    {
      id: "cpu",
      label: "CPU",
      unit: "percent",
      color: "#c084fc",
      current: lastValue(cpuPoints),
      points: cpuPoints,
      source: "hetzner",
    },
    guestSeriesFromSamples(guestSamples, startMs, endMs, "memoryPercent", {
      id: "memory",
      label: "Memory",
      color: "#fb923c",
    }),
    guestSeriesFromSamples(guestSamples, startMs, endMs, "diskPercent", {
      id: "disk",
      label: "Disk Usage",
      color: "#60a5fa",
    }),
    {
      id: "inbound",
      label: "Inbound bandwidth",
      unit: "mbps",
      color: "#67e8f9",
      current: lastValue(inboundPoints),
      points: inboundPoints,
      source: "hetzner",
    },
    {
      id: "outbound",
      label: "Outbound bandwidth",
      unit: "mbps",
      color: "#4ade80",
      current: lastValue(outboundPoints),
      points: outboundPoints,
      source: "hetzner",
    },
  ];

  // Best-effort: open BacksterOS support tickets when monitors stay breached.
  void evaluateServerMonitors({
    serverId: String(server.id),
    serverName: server.name,
    readings: {
      cpuPercent: lastValue(cpuPoints),
      memoryPercent: series.find((entry) => entry.id === "memory")?.current ?? null,
      diskPercent: series.find((entry) => entry.id === "disk")?.current ?? null,
    },
  }).catch(() => undefined);

  return {
    serverId: String(server.id),
    serverName: server.name,
    range,
    start: metrics.metrics.start ?? startIso,
    end: metrics.metrics.end ?? endIso,
    series,
  };
}

type AppSample = {
  readonly at: string;
  readonly cpuPercent: number;
  readonly memoryPercent: number;
};

type AppSamplesFile = {
  readonly apps: Record<string, { readonly samples: AppSample[] }>;
};

function appSamplesFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-metric-samples.json");
}

function appSampleKey(serverId: string, service: string): string {
  return `${serverId}:${service}`;
}

function readAppSamplesFile(): AppSamplesFile {
  try {
    const raw = fs.readFileSync(appSamplesFilePath(), "utf8");
    const parsed = JSON.parse(raw) as AppSamplesFile;
    if (!parsed || typeof parsed !== "object" || !parsed.apps) return { apps: {} };
    return parsed;
  } catch {
    return { apps: {} };
  }
}

function writeAppSamplesFile(file: AppSamplesFile): void {
  const dir = path.dirname(appSamplesFilePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(appSamplesFilePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

async function sampleAppContainerMetrics(ip: string, service: string): Promise<AppSample | null> {
  try {
    const raw = await sshExec(
      ip,
      [
        "python3 - <<'PY'",
        "import json, subprocess",
        `service = ${JSON.stringify(service)}`,
        "app_key = service[:-4] if service.endswith('-web') else service",
        "out = subprocess.check_output(",
        "  ['docker', 'stats', '--no-stream', '--format', '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemPerc}}'],",
        "  text=True,",
        "  stderr=subprocess.DEVNULL,",
        ")",
        "cpu_total = 0.0",
        "mem_total = 0.0",
        "matched = 0",
        "for line in out.splitlines():",
        "  parts = line.split('\\t')",
        "  if len(parts) < 3: continue",
        "  name, cpu_s, mem_s = parts[0], parts[1], parts[2]",
        "  if not (name == service or name.startswith(service + '-') or name == app_key or name.startswith(app_key + '-')):",
        "    continue",
        "  try:",
        "    cpu = float(cpu_s.strip().rstrip('%'))",
        "    mem = float(mem_s.strip().rstrip('%'))",
        "  except ValueError:",
        "    continue",
        "  cpu_total += cpu",
        "  mem_total += mem",
        "  matched += 1",
        "print(json.dumps({'matched': matched, 'cpu': cpu_total, 'mem': mem_total}))",
        "PY",
      ].join("\n"),
      { timeoutMs: 25_000 },
    );
    const parsed = JSON.parse(raw.trim()) as {
      readonly matched?: number;
      readonly cpu?: number;
      readonly mem?: number;
    };
    if (!parsed.matched || parsed.matched < 1) return null;
    const cpuPercent = Number(parsed.cpu);
    const memoryPercent = Number(parsed.mem);
    if (!Number.isFinite(cpuPercent) || !Number.isFinite(memoryPercent)) return null;
    return {
      at: new Date().toISOString(),
      cpuPercent,
      memoryPercent,
    };
  } catch {
    return null;
  }
}

function upsertAppSample(serverId: string, service: string, sample: AppSample): AppSample[] {
  const key = appSampleKey(serverId, service);
  const file = readAppSamplesFile();
  const existing = file.apps[key]?.samples ?? [];
  const last = existing[existing.length - 1];
  const sampleAt = Date.parse(sample.at);
  const lastAt = last ? Date.parse(last.at) : 0;
  const nextSamples =
    Number.isFinite(lastAt) && sampleAt - lastAt < APP_SAMPLE_MIN_INTERVAL_MS
      ? [...existing.slice(0, -1), sample]
      : [...existing, sample];
  const cutoff = Date.now() - SAMPLE_RETENTION_MS;
  const pruned = nextSamples.filter((entry) => Date.parse(entry.at) >= cutoff);
  writeAppSamplesFile({
    apps: {
      ...file.apps,
      [key]: { samples: pruned },
    },
  });
  return pruned;
}

function appSeriesFromSamples(
  samples: readonly AppSample[],
  startMs: number,
  endMs: number,
  key: "cpuPercent" | "memoryPercent",
  meta: Pick<MetricSeries, "id" | "label" | "color">,
): MetricSeries {
  const filterEnd = Math.max(endMs, Date.now()) + 60_000;
  const points = samples
    .map((sample) => {
      const t = Date.parse(sample.at);
      if (!Number.isFinite(t) || t < startMs || t > filterEnd) return null;
      return { t, v: sample[key] } satisfies MetricPoint;
    })
    .filter((point): point is MetricPoint => point != null);

  return {
    ...meta,
    unit: "percent",
    current: lastValue(points) ?? samples.at(-1)?.[key] ?? null,
    points,
    source: "docker",
  };
}

export async function loadAppMetrics(
  serverId: string,
  serviceInput: string,
  range: MetricRange,
): Promise<ServerMetricsPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required for app metrics");

  const server = (await findHetznerServer(serverId)) ?? (await getServer(serverId));
  const endMs = Date.now();
  const startMs = endMs - RANGE_MS[range];
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const ip = server.public_net.ipv4?.ip ?? null;
  if (!ip) throw new Error("Server has no public IPv4 address");

  const sample = await sampleAppContainerMetrics(ip, service);
  let samples = readAppSamplesFile().apps[appSampleKey(String(server.id), service)]?.samples ?? [];
  if (sample) {
    samples = upsertAppSample(String(server.id), service, sample);
  }

  return {
    serverId: String(server.id),
    serverName: server.name,
    service,
    range,
    start: startIso,
    end: endIso,
    series: [
      appSeriesFromSamples(samples, startMs, endMs, "cpuPercent", {
        id: "cpu",
        label: "Container CPU",
        color: "#c084fc",
      }),
      appSeriesFromSamples(samples, startMs, endMs, "memoryPercent", {
        id: "memory",
        label: "Container Memory",
        color: "#fb923c",
      }),
    ],
  };
}
