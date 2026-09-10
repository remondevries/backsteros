/**
 * Persist server/app monitors for the Observe → Monitoring UI.
 *
 * Notify channel: BacksterOS support ticket for a selected contact
 * (replaces the earlier in-app notification stub).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { resolveAppProjectId } from "./app-project-link.ts";
import { matchesServiceScope, normalizeServiceScope } from "./service-scope.ts";

export const MONITOR_METRICS = ["cpu_load", "used_memory", "used_disk"] as const;

export const MONITOR_OPERATORS = ["gte", "gt", "lte", "lt"] as const;

export type MonitorMetric = (typeof MONITOR_METRICS)[number];
export type MonitorOperator = (typeof MONITOR_OPERATORS)[number];
/** @deprecated Prefer support_ticket — kept for reading legacy rows. */
export type MonitorNotifyChannel = "support_ticket" | "in_app";

export type ServerMonitor = {
  readonly id: string;
  readonly serverId: string;
  /** Kamal service name when scoped to an app; null for server-level. */
  readonly service: string | null;
  readonly metric: MonitorMetric;
  readonly operator: MonitorOperator;
  readonly threshold: number;
  readonly durationMinutes: number;
  readonly notifyChannel: MonitorNotifyChannel;
  /** BacksterOS contact that receives the support ticket. */
  readonly notifyContactId: string | null;
  readonly notifyContactName: string | null;
  /** When the current continuous breach started (ISO), or null if healthy. */
  readonly breachSince: string | null;
  /** Last support ticket created for this monitor (ISO). */
  readonly lastFiredAt: string | null;
  readonly lastTicketId: string | null;
  readonly status: "active" | "paused";
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateServerMonitorInput = {
  readonly serverId: string;
  readonly service?: string | null;
  readonly metric: MonitorMetric;
  readonly operator: MonitorOperator;
  readonly threshold: number;
  readonly durationMinutes: number;
  readonly notifyChannel?: MonitorNotifyChannel;
  readonly notifyContactId: string;
  readonly notifyContactName?: string | null;
};

export type MetricReading = {
  readonly cpuPercent: number | null;
  readonly memoryPercent: number | null;
  readonly diskPercent: number | null;
};

type MonitorsFile = {
  readonly monitors: ServerMonitor[];
};

const DEFAULT_BACKSTEROS_API_URL = "http://127.0.0.1:8788";
/** Cooldown so one sustained breach does not spam tickets. */
const FIRE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function monitorsFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "server-monitors.json");
}

function normalizeMonitor(
  raw: Partial<ServerMonitor> & {
    readonly id: string;
    readonly serverId: string;
    readonly metric: MonitorMetric;
    readonly operator: MonitorOperator;
    readonly threshold: number;
    readonly durationMinutes: number;
  },
): ServerMonitor {
  const channel =
    raw.notifyChannel === "in_app" || raw.notifyChannel === "support_ticket"
      ? raw.notifyChannel
      : "support_ticket";
  return {
    id: raw.id,
    serverId: raw.serverId,
    service: typeof raw.service === "string" ? raw.service : null,
    metric: raw.metric,
    operator: raw.operator,
    threshold: raw.threshold,
    durationMinutes: raw.durationMinutes,
    notifyChannel: channel === "in_app" ? "support_ticket" : channel,
    notifyContactId:
      typeof raw.notifyContactId === "string" && raw.notifyContactId.trim()
        ? raw.notifyContactId.trim()
        : null,
    notifyContactName:
      typeof raw.notifyContactName === "string" && raw.notifyContactName.trim()
        ? raw.notifyContactName.trim()
        : null,
    breachSince: typeof raw.breachSince === "string" ? raw.breachSince : null,
    lastFiredAt: typeof raw.lastFiredAt === "string" ? raw.lastFiredAt : null,
    lastTicketId: typeof raw.lastTicketId === "string" ? raw.lastTicketId : null,
    status: raw.status === "paused" ? "paused" : "active",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function readFile(): MonitorsFile {
  const filePath = monitorsFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as MonitorsFile;
    if (!parsed || !Array.isArray(parsed.monitors)) return { monitors: [] };
    return {
      monitors: parsed.monitors.map((monitor) => normalizeMonitor(monitor)),
    };
  } catch {
    return { monitors: [] };
  }
}

function writeFile(data: MonitorsFile): void {
  const filePath = monitorsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function upsertMonitor(monitor: ServerMonitor): void {
  const current = readFile();
  const without = current.monitors.filter((entry) => entry.id !== monitor.id);
  writeFile({ monitors: [monitor, ...without] });
}

export function isMonitorMetric(value: unknown): value is MonitorMetric {
  return typeof value === "string" && (MONITOR_METRICS as readonly string[]).includes(value);
}

export function isMonitorOperator(value: unknown): value is MonitorOperator {
  return typeof value === "string" && (MONITOR_OPERATORS as readonly string[]).includes(value);
}

export function listServerMonitors(
  serverId: string,
  options?: { readonly service?: string | null },
): readonly ServerMonitor[] {
  return readFile()
    .monitors.filter(
      (monitor) =>
        monitor.serverId === serverId && matchesServiceScope(monitor.service, options?.service),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function createServerMonitor(input: CreateServerMonitorInput): ServerMonitor {
  const contactId = input.notifyContactId.trim();
  if (!contactId) throw new Error("notifyContactId is required");
  const now = new Date().toISOString();
  const monitor: ServerMonitor = {
    id: randomUUID(),
    serverId: input.serverId,
    service: normalizeServiceScope(input.service),
    metric: input.metric,
    operator: input.operator,
    threshold: input.threshold,
    durationMinutes: input.durationMinutes,
    notifyChannel: "support_ticket",
    notifyContactId: contactId,
    notifyContactName: input.notifyContactName?.trim() || null,
    breachSince: null,
    lastFiredAt: null,
    lastTicketId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const current = readFile();
  writeFile({ monitors: [monitor, ...current.monitors] });
  return monitor;
}

export function deleteServerMonitor(serverId: string, monitorId: string): boolean {
  const current = readFile();
  const next = current.monitors.filter(
    (monitor) => !(monitor.serverId === serverId && monitor.id === monitorId),
  );
  if (next.length === current.monitors.length) return false;
  writeFile({ monitors: next });
  return true;
}

function compareMetric(operator: MonitorOperator, value: number, threshold: number): boolean {
  switch (operator) {
    case "gte":
      return value >= threshold;
    case "gt":
      return value > threshold;
    case "lte":
      return value <= threshold;
    case "lt":
      return value < threshold;
    default:
      return false;
  }
}

function readingForMetric(metric: MonitorMetric, readings: MetricReading): number | null {
  switch (metric) {
    case "cpu_load":
      return readings.cpuPercent;
    case "used_memory":
      return readings.memoryPercent;
    case "used_disk":
      return readings.diskPercent;
    default:
      return null;
  }
}

function metricLabel(metric: MonitorMetric): string {
  switch (metric) {
    case "cpu_load":
      return "CPU load";
    case "used_memory":
      return "Used memory";
    case "used_disk":
      return "Used disk space";
    default:
      return metric;
  }
}

function resolveBacksterosApiOrigin(): string {
  const fromEnv = process.env.BACKSTEROS_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/u, "");
  return DEFAULT_BACKSTEROS_API_URL;
}

function resolveBacksterosApiKey(): string {
  const fromEnv = process.env.BACKSTEROS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const cliEnv = path.join(os.homedir(), ".config", "backsteros", "cli.env");
    const text = fs.readFileSync(cliEnv, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?BACKSTEROS_API_KEY=(.+)$/u.exec(line.trim());
      if (!match) continue;
      return match[1]!.trim().replace(/^['"]|['"]$/gu, "");
    }
  } catch {
    // Fall through.
  }
  return "";
}

async function createBacksterosSupportTicket(input: {
  readonly contactId: string;
  readonly title: string;
  readonly description: string;
  readonly projectId?: string | null;
}): Promise<{ readonly id: string; readonly number?: number }> {
  const origin = resolveBacksterosApiOrigin();
  const apiKey = resolveBacksterosApiKey();
  if (!apiKey) {
    throw new Error(
      "BacksterOS API key missing (BACKSTEROS_API_KEY or ~/.config/backsteros/cli.env)",
    );
  }

  const response = await fetch(`${origin}/api/v1/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      contactId: input.contactId,
      relatedContactIds: [input.contactId],
      support: true,
      inbox: true,
      status: "ready_to_start",
      priority: 2,
      activityActor: "agent",
    }),
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : text.slice(0, 300) || `HTTP ${response.status}`;
    throw new Error(`Failed to create support ticket: ${message}`);
  }

  const id =
    typeof payload.id === "string"
      ? payload.id
      : typeof (payload.task as { id?: unknown } | undefined)?.id === "string"
        ? (payload.task as { id: string }).id
        : null;
  if (!id) throw new Error("BacksterOS task create returned no id");
  const number =
    typeof payload.number === "number"
      ? payload.number
      : typeof (payload.task as { number?: unknown } | undefined)?.number === "number"
        ? (payload.task as { number: number }).number
        : undefined;
  return { id, ...(number !== undefined ? { number } : {}) };
}

function buildTicketCopy(input: {
  readonly monitor: ServerMonitor;
  readonly value: number;
  readonly serverName?: string | null;
}): { readonly title: string; readonly description: string } {
  const scope = input.monitor.service
    ? `${input.serverName ?? input.monitor.serverId} / ${input.monitor.service}`
    : (input.serverName ?? input.monitor.serverId);
  const label = metricLabel(input.monitor.metric);
  const title = `[Monitor] ${label} ${input.monitor.operator} ${input.monitor.threshold}% on ${scope}`;
  const description = [
    `A server monitor triggered a support ticket.`,
    ``,
    `- **Server:** ${input.serverName ?? input.monitor.serverId} (\`${input.monitor.serverId}\`)`,
    input.monitor.service ? `- **App / service:** \`${input.monitor.service}\`` : null,
    `- **Metric:** ${label}`,
    `- **Condition:** ${input.monitor.operator} ${input.monitor.threshold}% for ≥ ${input.monitor.durationMinutes} min`,
    `- **Observed value:** ${input.value.toFixed(1)}%`,
    `- **Contact:** ${input.monitor.notifyContactName ?? input.monitor.notifyContactId}`,
    `- **Monitor id:** \`${input.monitor.id}\``,
    `- **Triggered at:** ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, description };
}

export async function fireMonitorSupportTicket(input: {
  readonly monitor: ServerMonitor;
  readonly value: number;
  readonly serverName?: string | null;
  readonly force?: boolean;
}): Promise<{
  readonly ok: boolean;
  readonly ticketId?: string;
  readonly skipped?: string;
  readonly error?: string;
  readonly monitor: ServerMonitor;
}> {
  const monitor = input.monitor;
  if (!monitor.notifyContactId) {
    return { ok: false, error: "Monitor has no notify contact", monitor };
  }

  if (!input.force && monitor.lastFiredAt) {
    const elapsed = Date.now() - Date.parse(monitor.lastFiredAt);
    if (Number.isFinite(elapsed) && elapsed < FIRE_COOLDOWN_MS) {
      return {
        ok: true,
        skipped: "cooldown",
        monitor,
        ...(monitor.lastTicketId ? { ticketId: monitor.lastTicketId } : {}),
      };
    }
  }

  const copy = buildTicketCopy(input);
  try {
    const ticket = await createBacksterosSupportTicket({
      contactId: monitor.notifyContactId,
      title: copy.title,
      description: copy.description,
      projectId: resolveAppProjectId(monitor.serverId, monitor.service),
    });
    const now = new Date().toISOString();
    const next: ServerMonitor = {
      ...monitor,
      lastFiredAt: now,
      lastTicketId: ticket.id,
      updatedAt: now,
    };
    upsertMonitor(next);
    return { ok: true, ticketId: ticket.id, monitor: next };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
      monitor,
    };
  }
}

/**
 * Evaluate active monitors for a server against current readings.
 * Called after metrics sampling so sustained breaches open support tickets.
 */
export async function evaluateServerMonitors(input: {
  readonly serverId: string;
  readonly readings: MetricReading;
  readonly serverName?: string | null;
  readonly service?: string | null;
}): Promise<
  readonly { readonly monitorId: string; readonly fired: boolean; readonly ticketId?: string }[]
> {
  const monitors = listServerMonitors(input.serverId, { service: input.service }).filter(
    (monitor) => monitor.status === "active" && monitor.notifyContactId,
  );
  const results: Array<{
    readonly monitorId: string;
    readonly fired: boolean;
    readonly ticketId?: string;
  }> = [];
  const now = Date.now();

  for (const monitor of monitors) {
    const value = readingForMetric(monitor.metric, input.readings);
    if (value == null || !Number.isFinite(value)) {
      if (monitor.breachSince) {
        upsertMonitor({
          ...monitor,
          breachSince: null,
          updatedAt: new Date().toISOString(),
        });
      }
      results.push({ monitorId: monitor.id, fired: false });
      continue;
    }

    const breached = compareMetric(monitor.operator, value, monitor.threshold);
    if (!breached) {
      if (monitor.breachSince) {
        upsertMonitor({
          ...monitor,
          breachSince: null,
          updatedAt: new Date().toISOString(),
        });
      }
      results.push({ monitorId: monitor.id, fired: false });
      continue;
    }

    const breachSince = monitor.breachSince ?? new Date(now).toISOString();
    let current = monitor;
    if (!monitor.breachSince) {
      current = {
        ...monitor,
        breachSince,
        updatedAt: new Date().toISOString(),
      };
      upsertMonitor(current);
    }

    const breachAgeMs = now - Date.parse(breachSince);
    const requiredMs = Math.max(1, current.durationMinutes) * 60_000;
    if (!Number.isFinite(breachAgeMs) || breachAgeMs < requiredMs) {
      results.push({ monitorId: current.id, fired: false });
      continue;
    }

    const fired = await fireMonitorSupportTicket({
      monitor: current,
      value,
      serverName: input.serverName,
    });
    results.push({
      monitorId: current.id,
      fired: Boolean(fired.ok && fired.ticketId && !fired.skipped),
      ...(fired.ticketId ? { ticketId: fired.ticketId } : {}),
    });
  }

  return results;
}
