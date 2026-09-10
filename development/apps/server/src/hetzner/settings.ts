/**
 * App settings (Forge-style): general metadata, directories, git, notes.
 * Persisted locally; live container paths/image come from the host when available.
 *
 * WordPress: `framework: "wordpress"` is the control-plane flag equivalent to
 * deploy-contract.md `runtime: "wordpress"`. Components are not stored here —
 * see wordpress-components.ts.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadAppDomains } from "./domains.ts";
import { findHetznerServer } from "./server-connection.ts";
import { normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";
import { updateAppDeploySettings } from "./deploy.ts";

export const APP_FRAMEWORKS = [
  "generic",
  "wordpress",
  "laravel",
  "nodejs",
  "static",
  "docker",
] as const;

export type AppFramework = (typeof APP_FRAMEWORKS)[number];

export const APP_COLOR_SWATCHES = [
  "#5b8def",
  "#3d9a6a",
  "#c4922a",
  "#7c5cbf",
  "#c45c5c",
  "#e0b44e",
  "#5cb8d6",
  "#e8e8e8",
  null,
] as const;

export type AppSiteNote = {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
};

export type AppSettingsRecord = {
  readonly serverId: string;
  readonly service: string;
  readonly framework: AppFramework;
  readonly runtimeVersion: string;
  readonly tags: string;
  readonly initial: string;
  readonly accent: string | null;
  readonly avatarDataUrl: string | null;
  readonly notes: readonly AppSiteNote[];
  readonly rootDirectory: string;
  readonly webDirectory: string;
  readonly gitRepository: string;
  readonly gitBranch: string;
  readonly updatedAt: string;
};

export type AppSettingsPayload = {
  readonly serverId: string;
  readonly service: string;
  /** Contract alias: `"wordpress"` when framework is WordPress. */
  readonly runtime: AppFramework;
  readonly domain: string;
  readonly image: string | null;
  readonly detectedRuntime: string;
  readonly directoryBase: string;
  readonly settings: AppSettingsRecord;
};

type SettingsFile = {
  readonly settings: AppSettingsRecord[];
};

function settingsFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-settings.json");
}

function readFile(): SettingsFile {
  try {
    const raw = fs.readFileSync(settingsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as SettingsFile;
    if (!parsed || !Array.isArray(parsed.settings)) return { settings: [] };
    return { settings: parsed.settings };
  } catch {
    return { settings: [] };
  }
}

function writeFile(data: SettingsFile): void {
  const filePath = settingsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Overlay saved accent/initial onto discovered sites (sync, no SSH). */
export function applySavedAppearanceToSites<
  T extends {
    readonly serverId: number | string;
    readonly service: string;
    readonly accent: string;
    readonly initial: string;
  },
>(sites: readonly T[]): T[] {
  const file = readFile();
  if (file.settings.length === 0) return [...sites];
  const byKey = new Map(
    file.settings.map((entry) => [`${entry.serverId}:${entry.service}`, entry] as const),
  );
  return sites.map((site) => {
    const saved = byKey.get(`${String(site.serverId)}:${site.service}`);
    if (!saved) return site;
    return {
      ...site,
      accent: saved.accent ?? site.accent,
      initial: saved.initial?.trim() ? saved.initial : site.initial,
    };
  });
}

function isFramework(value: unknown): value is AppFramework {
  return typeof value === "string" && (APP_FRAMEWORKS as readonly string[]).includes(value);
}

async function resolveServer(serverId: string): Promise<{
  readonly serverId: string;
  readonly ip: string;
}> {
  const server = await findHetznerServer(serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");
  return { serverId: String(server.id), ip };
}

async function resolveContainerMeta(
  ip: string,
  service: string,
): Promise<{ readonly workdir: string; readonly image: string | null }> {
  try {
    const raw = await sshExec(
      ip,
      [
        "python3 - <<'PY'",
        "import json, subprocess",
        `service = ${JSON.stringify(service)}`,
        "app_key = service[:-4] if service.endswith('-web') else service",
        "out = subprocess.check_output(['docker','ps','--format','{{.Names}}\\t{{.Image}}'], text=True, stderr=subprocess.DEVNULL)",
        "match = None",
        "image = None",
        "for line in out.splitlines():",
        "  parts = line.strip().split('\\t')",
        "  if len(parts) < 1: continue",
        "  name = parts[0]",
        "  if name == service or name.startswith(service + '-') or name == app_key or name.startswith(app_key + '-'):",
        "    match = name",
        "    image = parts[1] if len(parts) > 1 else None",
        "    break",
        "if not match:",
        "  print(json.dumps({'workdir': '/app', 'image': None}))",
        "  raise SystemExit(0)",
        "inspect = json.loads(subprocess.check_output(['docker','inspect', match], text=True))[0]",
        "workdir = (inspect.get('Config') or {}).get('WorkingDir') or '/app'",
        "print(json.dumps({'workdir': workdir, 'image': image}))",
        "PY",
      ].join("\n"),
      { timeoutMs: 30_000 },
    );
    const parsed = JSON.parse(raw.trim()) as {
      readonly workdir?: string;
      readonly image?: string | null;
    };
    return {
      workdir: parsed.workdir?.trim() || "/app",
      image: parsed.image ?? null,
    };
  } catch {
    return { workdir: "/app", image: null };
  }
}

function defaultSettings(input: {
  readonly serverId: string;
  readonly service: string;
  readonly domain: string;
  readonly repository: string | null;
  readonly version: string | null;
  readonly runtime: string;
  readonly accent: string;
  readonly initial: string;
  readonly workdir: string;
}): AppSettingsRecord {
  const now = new Date().toISOString();
  return {
    serverId: input.serverId,
    service: input.service,
    framework: "docker",
    runtimeVersion: input.version ?? input.runtime,
    tags: "",
    initial: input.initial || input.domain.slice(0, 1).toUpperCase(),
    accent: input.accent,
    avatarDataUrl: null,
    notes: [],
    rootDirectory: "/",
    webDirectory: "/",
    gitRepository: input.repository ?? "",
    gitBranch: "main",
    updatedAt: now,
  };
}

function mergeSettings(
  stored: AppSettingsRecord | undefined,
  defaults: AppSettingsRecord,
): AppSettingsRecord {
  if (!stored) return defaults;
  return {
    ...defaults,
    ...stored,
    serverId: defaults.serverId,
    service: defaults.service,
    notes: Array.isArray(stored.notes) ? stored.notes : [],
    accent: stored.accent === undefined ? defaults.accent : stored.accent,
  };
}

function initialForDomain(domain: string): string {
  const host = domain.split(".")[0] ?? domain;
  return (host[0] ?? "A").toUpperCase();
}

function accentForKey(key: string): string {
  const accents = ["#7c5cbf", "#3d9a6a", "#5b8def", "#c4922a", "#c45c5c", "#2f8f8a"] as const;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return accents[hash % accents.length]!;
}

function parseImage(image: string | null): {
  readonly repository: string | null;
  readonly version: string | null;
  readonly runtime: string;
} {
  if (!image) return { repository: null, version: null, runtime: "Docker" };
  const [repoPart, version = null] = image.split(":");
  const repo = repoPart?.replace(/^ghcr\.io\//u, "") ?? null;
  return {
    repository: repo,
    version,
    runtime: "Docker",
  };
}

export async function loadAppSettings(
  serverIdInput: string,
  serviceInput: string,
): Promise<AppSettingsPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const { serverId, ip } = await resolveServer(serverIdInput);
  const domains = await loadAppDomains(serverId, service);
  const meta = await resolveContainerMeta(ip, service);
  const parsed = parseImage(meta.image ?? domains.target);
  const domain = domains.canonicalHost || domains.hosts[0]?.host || service;
  const defaults = defaultSettings({
    serverId,
    service,
    domain,
    repository: parsed.repository,
    version: parsed.version,
    runtime: parsed.runtime,
    accent: accentForKey(service),
    initial: initialForDomain(domain),
    workdir: meta.workdir,
  });
  const file = readFile();
  const stored = file.settings.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const settings = mergeSettings(stored, defaults);

  return {
    serverId,
    service,
    runtime: settings.framework,
    domain,
    image: meta.image,
    detectedRuntime: parsed.runtime,
    directoryBase: meta.workdir.replace(/\/$/u, "") || "/app",
    settings,
  };
}

export type UpdateAppSettingsInput = {
  readonly serverId: string;
  readonly service: string;
  readonly framework?: AppFramework;
  readonly runtimeVersion?: string;
  readonly tags?: string;
  readonly initial?: string;
  readonly accent?: string | null;
  readonly avatarDataUrl?: string | null;
  readonly rootDirectory?: string;
  readonly webDirectory?: string;
  readonly gitRepository?: string;
  readonly gitBranch?: string;
  readonly notes?: readonly AppSiteNote[];
};

export async function updateAppSettings(
  input: UpdateAppSettingsInput,
): Promise<AppSettingsPayload> {
  const current = await loadAppSettings(input.serverId, input.service);
  const prev = current.settings;

  if (input.framework !== undefined && !isFramework(input.framework)) {
    throw new Error("Invalid framework");
  }

  const next: AppSettingsRecord = {
    ...prev,
    framework: input.framework ?? prev.framework,
    runtimeVersion:
      input.runtimeVersion !== undefined ? input.runtimeVersion.trim() : prev.runtimeVersion,
    tags: input.tags !== undefined ? input.tags.trim() : prev.tags,
    initial:
      input.initial !== undefined
        ? input.initial.trim().slice(0, 2).toUpperCase() || prev.initial
        : prev.initial,
    accent: input.accent !== undefined ? input.accent : prev.accent,
    avatarDataUrl: input.avatarDataUrl !== undefined ? input.avatarDataUrl : prev.avatarDataUrl,
    rootDirectory:
      input.rootDirectory !== undefined
        ? normalizeRelativeDir(input.rootDirectory)
        : prev.rootDirectory,
    webDirectory:
      input.webDirectory !== undefined
        ? normalizeRelativeDir(input.webDirectory)
        : prev.webDirectory,
    gitRepository:
      input.gitRepository !== undefined ? input.gitRepository.trim() : prev.gitRepository,
    gitBranch: input.gitBranch !== undefined ? input.gitBranch.trim() || "main" : prev.gitBranch,
    notes: input.notes !== undefined ? input.notes : prev.notes,
    updatedAt: new Date().toISOString(),
  };

  const file = readFile();
  const without = file.settings.filter(
    (entry) => !(entry.serverId === next.serverId && entry.service === next.service),
  );
  writeFile({ settings: [next, ...without] });

  // WordPress apps use the wordpress deploy adapter (contract runtime flag).
  if (next.framework === "wordpress" && prev.framework !== "wordpress") {
    try {
      await updateAppDeploySettings({
        serverId: next.serverId,
        service: next.service,
        adapter: "wordpress",
      });
    } catch {
      // Non-fatal: settings already saved.
    }
  }

  return {
    ...current,
    runtime: next.framework,
    settings: next,
  };
}

function normalizeRelativeDir(value: string): string {
  const trimmed = value.trim() || "/";
  if (trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export async function addAppSettingNote(input: {
  readonly serverId: string;
  readonly service: string;
  readonly body: string;
}): Promise<AppSettingsPayload> {
  const body = input.body.trim();
  if (!body) throw new Error("Note body is required");
  const current = await loadAppSettings(input.serverId, input.service);
  const note: AppSiteNote = {
    id: randomUUID(),
    body,
    createdAt: new Date().toISOString(),
  };
  return updateAppSettings({
    serverId: input.serverId,
    service: input.service,
    notes: [note, ...current.settings.notes],
  });
}

export async function deleteAppSettingNote(input: {
  readonly serverId: string;
  readonly service: string;
  readonly noteId: string;
}): Promise<AppSettingsPayload> {
  const current = await loadAppSettings(input.serverId, input.service);
  return updateAppSettings({
    serverId: input.serverId,
    service: input.service,
    notes: current.settings.notes.filter((note) => note.id !== input.noteId),
  });
}
