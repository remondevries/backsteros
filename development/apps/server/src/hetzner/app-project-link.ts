/**
 * Link a discovered Hetzner app (serverId + service) to a BacksterOS codebase project.
 * Used by Overview → Details and when deploy/monitor notifications open support tickets.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { normalizeServiceScope } from "./service-scope.ts";

export type AppProjectLinkRecord = {
  readonly serverId: string;
  readonly service: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly projectKey: string | null;
  readonly updatedAt: string;
};

export type AppProjectLinkPayload = {
  readonly serverId: string;
  readonly service: string;
  readonly link: AppProjectLinkRecord;
};

type LinksFile = {
  readonly links: AppProjectLinkRecord[];
};

function linksFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-project-links.json");
}

function readFile(): LinksFile {
  try {
    const raw = fs.readFileSync(linksFilePath(), "utf8");
    const parsed = JSON.parse(raw) as LinksFile;
    if (!parsed || !Array.isArray(parsed.links)) return { links: [] };
    return { links: parsed.links.map(normalizeLink) };
  } catch {
    return { links: [] };
  }
}

function writeFile(data: LinksFile): void {
  const filePath = linksFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeLink(raw: Partial<AppProjectLinkRecord>): AppProjectLinkRecord {
  return {
    serverId: typeof raw.serverId === "string" ? raw.serverId : "",
    service: typeof raw.service === "string" ? raw.service : "",
    projectId:
      typeof raw.projectId === "string" && raw.projectId.trim() ? raw.projectId.trim() : null,
    projectName:
      typeof raw.projectName === "string" && raw.projectName.trim() ? raw.projectName.trim() : null,
    projectKey:
      typeof raw.projectKey === "string" && raw.projectKey.trim() ? raw.projectKey.trim() : null,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

function defaultLink(serverId: string, service: string): AppProjectLinkRecord {
  return {
    serverId,
    service,
    projectId: null,
    projectName: null,
    projectKey: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Resolve the linked BacksterOS project id for an app, or null when unset.
 */
export function resolveAppProjectId(
  serverIdInput: string,
  serviceInput: string | null | undefined,
): string | null {
  const service = normalizeServiceScope(serviceInput);
  if (!service) return null;
  const serverId = serverIdInput.trim();
  if (!serverId) return null;
  const existing = readFile().links.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  return existing?.projectId ?? null;
}

export async function loadAppProjectLink(
  serverIdInput: string,
  serviceInput: string,
): Promise<AppProjectLinkPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const serverId = serverIdInput.trim();
  if (!serverId) throw new Error("serverId is required");

  const file = readFile();
  const existing = file.links.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const link = existing ?? defaultLink(serverId, service);
  if (!existing) {
    writeFile({ links: [link, ...file.links] });
  }
  return { serverId, service, link };
}

export async function updateAppProjectLink(input: {
  readonly serverId: string;
  readonly service: string;
  readonly projectId?: string | null;
  readonly projectName?: string | null;
  readonly projectKey?: string | null;
}): Promise<AppProjectLinkPayload> {
  const current = await loadAppProjectLink(input.serverId, input.service);
  const prev = current.link;

  let projectId = prev.projectId;
  let projectName = prev.projectName;
  let projectKey = prev.projectKey;

  if (input.projectId !== undefined) {
    const nextId =
      typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : null;
    projectId = nextId;
    if (nextId == null) {
      projectName = null;
      projectKey = null;
    } else {
      projectName =
        input.projectName !== undefined ? input.projectName?.trim() || null : prev.projectName;
      projectKey =
        input.projectKey !== undefined ? input.projectKey?.trim() || null : prev.projectKey;
    }
  } else {
    if (input.projectName !== undefined) {
      projectName = input.projectName?.trim() || null;
    }
    if (input.projectKey !== undefined) {
      projectKey = input.projectKey?.trim() || null;
    }
  }

  const next: AppProjectLinkRecord = {
    ...prev,
    projectId,
    projectName,
    projectKey,
    updatedAt: new Date().toISOString(),
  };

  const file = readFile();
  const without = file.links.filter(
    (entry) => !(entry.serverId === next.serverId && entry.service === next.service),
  );
  writeFile({ links: [next, ...without] });
  return { serverId: next.serverId, service: next.service, link: next };
}
