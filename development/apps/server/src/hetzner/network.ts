/**
 * App network settings (Forge-style): security rules + redirects.
 * Persisted locally; site-wide basic auth is applied via kamal-proxy when possible.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyAppBasicAuth } from "./domains.ts";
import { findHetznerServer } from "./server-connection.ts";
import { normalizeServiceScope } from "./service-scope.ts";

export type SecurityCredential = {
  readonly id: string;
  readonly username: string;
  readonly password: string;
};

export type AppSecurityRule = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly name: string;
  /** Empty string = entire site. */
  readonly path: string;
  readonly credentials: readonly SecurityCredential[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RedirectType = "permanent" | "temporary";

export type AppRedirectRule = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly from: string;
  readonly to: string;
  readonly type: RedirectType;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AppNetworkPayload = {
  readonly serverId: string;
  readonly service: string;
  readonly securityRules: readonly AppSecurityRule[];
  readonly redirects: readonly AppRedirectRule[];
  readonly proxyBasicAuthApplied: boolean;
  readonly proxyBasicAuthNote: string | null;
};

type NetworkFile = {
  readonly securityRules: AppSecurityRule[];
  readonly redirects: AppRedirectRule[];
};

function networkFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-network.json");
}

function readFile(): NetworkFile {
  try {
    const raw = fs.readFileSync(networkFilePath(), "utf8");
    const parsed = JSON.parse(raw) as NetworkFile;
    if (!parsed) return { securityRules: [], redirects: [] };
    return {
      securityRules: Array.isArray(parsed.securityRules) ? parsed.securityRules : [],
      redirects: Array.isArray(parsed.redirects) ? parsed.redirects : [],
    };
  } catch {
    return { securityRules: [], redirects: [] };
  }
}

function writeFile(data: NetworkFile): void {
  const filePath = networkFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function resolveServerId(serverId: string): Promise<string> {
  const server = await findHetznerServer(serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  return String(server.id);
}

function normalizePath(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function assertCredentials(credentials: readonly SecurityCredential[]): void {
  if (credentials.length === 0) {
    throw new Error("Add at least one credential for this security rule");
  }
  for (const cred of credentials) {
    if (!cred.username.trim()) throw new Error("Credential username is required");
    if (!cred.password) throw new Error("Credential password is required");
  }
}

function normalizeCredentials(
  input: readonly { readonly username: string; readonly password: string; readonly id?: string }[],
): SecurityCredential[] {
  return input.map((entry) => ({
    id: entry.id?.trim() || randomUUID(),
    username: entry.username.trim(),
    password: entry.password,
  }));
}

function siteWideCredential(
  rules: readonly AppSecurityRule[],
): { readonly username: string; readonly password: string } | null {
  const siteWide = rules.filter((rule) => rule.path === "");
  if (siteWide.length === 0) return null;
  // kamal-proxy supports a single username:password for the whole service.
  const first = siteWide[0]?.credentials[0];
  if (!first) return null;
  return { username: first.username, password: first.password };
}

async function syncProxyBasicAuth(
  serverId: string,
  service: string,
  rules: readonly AppSecurityRule[],
): Promise<{ readonly applied: boolean; readonly note: string | null }> {
  const cred = siteWideCredential(rules);
  const pathScoped = rules.some((rule) => rule.path !== "");
  try {
    await applyAppBasicAuth({
      serverId,
      service,
      username: cred?.username ?? null,
      password: cred?.password ?? null,
    });
    if (cred && pathScoped) {
      return {
        applied: true,
        note: "Site-wide basic auth was applied via kamal-proxy. Path-scoped rules are stored here but are not enforced by the proxy yet.",
      };
    }
    if (cred) {
      return {
        applied: true,
        note: "Site-wide basic auth applied via kamal-proxy.",
      };
    }
    return {
      applied: false,
      note: pathScoped
        ? "Path-scoped security rules are stored in the control plane. kamal-proxy only supports site-wide basic auth today."
        : null,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      applied: false,
      note: `Saved locally, but kamal-proxy basic auth sync failed: ${message}`,
    };
  }
}

function toPayload(
  serverId: string,
  service: string,
  file: NetworkFile,
  proxy: { readonly applied: boolean; readonly note: string | null },
): AppNetworkPayload {
  const securityRules = file.securityRules
    .filter((rule) => rule.serverId === serverId && rule.service === service)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const redirects = file.redirects
    .filter((rule) => rule.serverId === serverId && rule.service === service)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return {
    serverId,
    service,
    securityRules,
    redirects,
    proxyBasicAuthApplied: proxy.applied,
    proxyBasicAuthNote: proxy.note,
  };
}

export async function loadAppNetwork(
  serverIdInput: string,
  serviceInput: string,
): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const serverId = await resolveServerId(serverIdInput);
  const file = readFile();
  const rules = file.securityRules.filter(
    (rule) => rule.serverId === serverId && rule.service === service,
  );
  const cred = siteWideCredential(rules);
  const pathScoped = rules.some((rule) => rule.path !== "");
  let note: string | null = null;
  if (cred && pathScoped) {
    note =
      "Site-wide basic auth can be applied via kamal-proxy. Path-scoped rules are stored here but are not enforced by the proxy yet.";
  } else if (!cred && pathScoped) {
    note =
      "Path-scoped security rules are stored in the control plane. kamal-proxy only supports site-wide basic auth today.";
  }
  return toPayload(serverId, service, file, { applied: Boolean(cred), note });
}

export async function createSecurityRule(input: {
  readonly serverId: string;
  readonly service: string;
  readonly name: string;
  readonly path?: string;
  readonly credentials: readonly {
    readonly username: string;
    readonly password: string;
  }[];
}): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const credentials = normalizeCredentials(input.credentials);
  assertCredentials(credentials);
  const serverId = await resolveServerId(input.serverId);
  const now = new Date().toISOString();
  const rule: AppSecurityRule = {
    id: randomUUID(),
    serverId,
    service,
    name,
    path: normalizePath(input.path),
    credentials,
    createdAt: now,
    updatedAt: now,
  };
  const file = readFile();
  const next: NetworkFile = {
    ...file,
    securityRules: [rule, ...file.securityRules],
  };
  writeFile(next);
  const scoped = next.securityRules.filter(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const proxy = await syncProxyBasicAuth(serverId, service, scoped);
  return toPayload(serverId, service, next, proxy);
}

export async function updateSecurityRule(input: {
  readonly serverId: string;
  readonly service: string;
  readonly ruleId: string;
  readonly name: string;
  readonly path?: string;
  readonly credentials: readonly {
    readonly id?: string;
    readonly username: string;
    readonly password: string;
  }[];
}): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const credentials = normalizeCredentials(input.credentials);
  assertCredentials(credentials);
  const serverId = await resolveServerId(input.serverId);
  const file = readFile();
  const index = file.securityRules.findIndex(
    (entry) =>
      entry.id === input.ruleId && entry.serverId === serverId && entry.service === service,
  );
  if (index < 0) throw new Error("Security rule not found");
  const existing = file.securityRules[index]!;
  const updated: AppSecurityRule = {
    ...existing,
    name,
    path: normalizePath(input.path),
    credentials,
    updatedAt: new Date().toISOString(),
  };
  const securityRules = [...file.securityRules];
  securityRules[index] = updated;
  const next = { ...file, securityRules };
  writeFile(next);
  const scoped = securityRules.filter(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const proxy = await syncProxyBasicAuth(serverId, service, scoped);
  return toPayload(serverId, service, next, proxy);
}

export async function deleteSecurityRule(input: {
  readonly serverId: string;
  readonly service: string;
  readonly ruleId: string;
}): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const serverId = await resolveServerId(input.serverId);
  const file = readFile();
  const securityRules = file.securityRules.filter(
    (entry) =>
      !(entry.id === input.ruleId && entry.serverId === serverId && entry.service === service),
  );
  if (securityRules.length === file.securityRules.length) {
    throw new Error("Security rule not found");
  }
  const next = { ...file, securityRules };
  writeFile(next);
  const scoped = securityRules.filter(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const proxy = await syncProxyBasicAuth(serverId, service, scoped);
  return toPayload(serverId, service, next, proxy);
}

export async function createRedirectRule(input: {
  readonly serverId: string;
  readonly service: string;
  readonly from: string;
  readonly to: string;
  readonly type: RedirectType;
}): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from) throw new Error("From is required");
  if (!to) throw new Error("To is required");
  if (input.type !== "permanent" && input.type !== "temporary") {
    throw new Error("Type must be permanent or temporary");
  }
  const serverId = await resolveServerId(input.serverId);
  const now = new Date().toISOString();
  const rule: AppRedirectRule = {
    id: randomUUID(),
    serverId,
    service,
    from,
    to,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  };
  const file = readFile();
  const next = { ...file, redirects: [rule, ...file.redirects] };
  writeFile(next);
  return toPayload(serverId, service, next, {
    applied: false,
    note: "Redirect rules are stored in the control plane. kamal-proxy does not apply custom path redirects yet — configure them in the app or an edge layer if needed.",
  });
}

export async function updateRedirectRule(input: {
  readonly serverId: string;
  readonly service: string;
  readonly ruleId: string;
  readonly from: string;
  readonly to: string;
  readonly type: RedirectType;
}): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from) throw new Error("From is required");
  if (!to) throw new Error("To is required");
  if (input.type !== "permanent" && input.type !== "temporary") {
    throw new Error("Type must be permanent or temporary");
  }
  const serverId = await resolveServerId(input.serverId);
  const file = readFile();
  const index = file.redirects.findIndex(
    (entry) =>
      entry.id === input.ruleId && entry.serverId === serverId && entry.service === service,
  );
  if (index < 0) throw new Error("Redirect rule not found");
  const existing = file.redirects[index]!;
  const updated: AppRedirectRule = {
    ...existing,
    from,
    to,
    type: input.type,
    updatedAt: new Date().toISOString(),
  };
  const redirects = [...file.redirects];
  redirects[index] = updated;
  const next = { ...file, redirects };
  writeFile(next);
  return toPayload(serverId, service, next, {
    applied: false,
    note: "Redirect rules are stored in the control plane. kamal-proxy does not apply custom path redirects yet.",
  });
}

export async function deleteRedirectRule(input: {
  readonly serverId: string;
  readonly service: string;
  readonly ruleId: string;
}): Promise<AppNetworkPayload> {
  const service = normalizeServiceScope(input.service);
  if (!service) throw new Error("service is required");
  const serverId = await resolveServerId(input.serverId);
  const file = readFile();
  const redirects = file.redirects.filter(
    (entry) =>
      !(entry.id === input.ruleId && entry.serverId === serverId && entry.service === service),
  );
  if (redirects.length === file.redirects.length) {
    throw new Error("Redirect rule not found");
  }
  const next = { ...file, redirects };
  writeFile(next);
  return toPayload(serverId, service, next, { applied: false, note: null });
}
