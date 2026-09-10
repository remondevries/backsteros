/**
 * App notification settings (Settings → Notifications).
 * Forge-style: failure contact (BacksterOS support ticket) + optional deploy hook URL.
 * No Slack / Discord / Telegram.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveAppProjectId } from "./app-project-link.ts";
import { normalizeServiceScope } from "./service-scope.ts";

export type AppNotificationsRecord = {
  readonly serverId: string;
  readonly service: string;
  /** BacksterOS contact for deploy-failure support tickets. */
  readonly failureContactId: string | null;
  readonly failureContactName: string | null;
  readonly deployHookEnabled: boolean;
  readonly deployHookUrl: string;
  readonly updatedAt: string;
};

export type AppNotificationsPayload = {
  readonly serverId: string;
  readonly service: string;
  readonly settings: AppNotificationsRecord;
};

type NotificationsFile = {
  readonly settings: AppNotificationsRecord[];
};

const DEFAULT_BACKSTEROS_API_URL = "http://127.0.0.1:8788";

function notificationsFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-notifications.json");
}

function readFile(): NotificationsFile {
  try {
    const raw = fs.readFileSync(notificationsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as NotificationsFile;
    if (!parsed || !Array.isArray(parsed.settings)) return { settings: [] };
    return { settings: parsed.settings };
  } catch {
    return { settings: [] };
  }
}

function writeFile(data: NotificationsFile): void {
  const filePath = notificationsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function defaultSettings(serverId: string, service: string): AppNotificationsRecord {
  return {
    serverId,
    service,
    failureContactId: null,
    failureContactName: null,
    deployHookEnabled: false,
    deployHookUrl: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeUrl(value: string): string {
  return value.trim();
}

export async function loadAppNotifications(
  serverIdInput: string,
  serviceInput: string,
): Promise<AppNotificationsPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const serverId = serverIdInput.trim();
  if (!serverId) throw new Error("serverId is required");

  const file = readFile();
  const existing = file.settings.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const settings = existing ?? defaultSettings(serverId, service);
  if (!existing) {
    writeFile({ settings: [settings, ...file.settings] });
  }
  return { serverId, service, settings };
}

export async function updateAppNotifications(input: {
  readonly serverId: string;
  readonly service: string;
  readonly failureContactId?: string | null;
  readonly failureContactName?: string | null;
  readonly deployHookEnabled?: boolean;
  readonly deployHookUrl?: string;
}): Promise<AppNotificationsPayload> {
  const current = await loadAppNotifications(input.serverId, input.service);
  const prev = current.settings;

  let failureContactId = prev.failureContactId;
  let failureContactName = prev.failureContactName;
  if (input.failureContactId !== undefined) {
    const nextId =
      typeof input.failureContactId === "string" && input.failureContactId.trim()
        ? input.failureContactId.trim()
        : null;
    failureContactId = nextId;
    failureContactName =
      nextId == null ? null : input.failureContactName?.trim() || prev.failureContactName;
  } else if (input.failureContactName !== undefined) {
    failureContactName = input.failureContactName?.trim() || null;
  }

  const deployHookUrl =
    input.deployHookUrl !== undefined ? normalizeUrl(input.deployHookUrl) : prev.deployHookUrl;
  const deployHookEnabled = input.deployHookEnabled ?? prev.deployHookEnabled;
  if (deployHookEnabled && deployHookUrl) {
    try {
      const parsed = new URL(deployHookUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Deploy hook URL must be http(s)");
      }
    } catch {
      throw new Error("Deploy hook URL is invalid");
    }
  }

  const next: AppNotificationsRecord = {
    ...prev,
    failureContactId,
    failureContactName,
    deployHookEnabled,
    deployHookUrl,
    updatedAt: new Date().toISOString(),
  };

  const file = readFile();
  const without = file.settings.filter(
    (entry) => !(entry.serverId === next.serverId && entry.service === next.service),
  );
  writeFile({ settings: [next, ...without] });
  return { serverId: next.serverId, service: next.service, settings: next };
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

async function createDeployFailureSupportTicket(input: {
  readonly contactId: string;
  readonly title: string;
  readonly description: string;
  readonly projectId?: string | null;
}): Promise<string | null> {
  const apiKey = resolveBacksterosApiKey();
  if (!apiKey) return null;
  const origin = resolveBacksterosApiOrigin();
  try {
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
    if (!response.ok) return null;
    const payload = (await response.json()) as { readonly id?: string };
    return typeof payload.id === "string" ? payload.id : null;
  } catch {
    return null;
  }
}

async function pingDeployHook(url: string, payload: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "BacksterOS-DeployHook/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Best-effort — deploy already finished.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * After a deploy finishes: ping custom hook on success, open support ticket on failure.
 */
export async function notifyAppDeployOutcome(input: {
  readonly serverId: string;
  readonly service: string;
  readonly domain?: string | null;
  readonly status: "success" | "failed";
  readonly output?: string | null;
  readonly finishedAt?: string | null;
}): Promise<void> {
  const { settings } = await loadAppNotifications(input.serverId, input.service);

  if (input.status === "success" && settings.deployHookEnabled && settings.deployHookUrl) {
    await pingDeployHook(settings.deployHookUrl, {
      event: "deploy.succeeded",
      serverId: input.serverId,
      service: input.service,
      domain: input.domain ?? null,
      finishedAt: input.finishedAt ?? new Date().toISOString(),
    });
  }

  if (input.status === "failed" && settings.failureContactId) {
    const title = `[Deploy failed] ${input.service}${input.domain ? ` (${input.domain})` : ""}`;
    const description = [
      `A deployment failed and opened this support ticket.`,
      ``,
      `- **Server id:** \`${input.serverId}\``,
      `- **Service:** \`${input.service}\``,
      input.domain ? `- **Domain:** ${input.domain}` : null,
      `- **Contact:** ${settings.failureContactName ?? settings.failureContactId}`,
      `- **Finished at:** ${input.finishedAt ?? new Date().toISOString()}`,
      ``,
      `### Deploy output (tail)`,
      "```",
      (input.output ?? "").trim().slice(-4000) || "(no output)",
      "```",
    ]
      .filter(Boolean)
      .join("\n");
    await createDeployFailureSupportTicket({
      contactId: settings.failureContactId,
      title,
      description,
      projectId: resolveAppProjectId(input.serverId, input.service),
    });
  }
}
