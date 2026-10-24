/**
 * Dispatch control-API sessions against a paired remote T3 environment
 * (stock `t3 serve`, orchestration protocol V2 — no Backster control routes).
 *
 * - Reads: `GET /api/orchestration/shell` (+ `x-t3-orchestration-protocol: 2`).
 * - Projects: `POST /api/projects/mutate`.
 * - Commands (`thread.create`, `message.dispatch`): `orchestration.dispatchCommand`
 *   over the environment WebSocket RPC; V2 has no HTTP dispatch route.
 */
import {
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
  ORCHESTRATION_V2_WS_METHODS,
  ProviderInstanceId,
  type ModelSelection,
  type OrchestrationProjectShell,
  type OrchestrationV2Command,
  OrchestrationV2ThreadShell,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as NodeSocket from "@effect/platform-node/NodeSocket";
import { createModelSelection } from "@t3tools/shared/model";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as Socket from "effect/socket/Socket";

/** JSON wire form of a V2 thread shell (dates and ids are plain strings). */
export type RemoteThreadShell = typeof OrchestrationV2ThreadShell.Encoded;

function matchRemoteT3Project<T extends { readonly id: string; readonly workspaceRoot: string }>(
  projects: ReadonlyArray<T>,
  input: {
    readonly workspaceRoot: string;
    readonly projectIdOverride: string | null;
  },
):
  | { readonly kind: "found"; readonly project: T }
  | { readonly kind: "missing_id"; readonly projectId: string }
  | { readonly kind: "unlinked" } {
  if (input.projectIdOverride) {
    const byId = projects.find((project) => project.id === input.projectIdOverride);
    if (!byId) return { kind: "missing_id", projectId: input.projectIdOverride };
    return { kind: "found", project: byId };
  }
  const normalized = normalizeProjectPathForComparison(input.workspaceRoot);
  if (normalized.length === 0) return { kind: "unlinked" };
  const match = projects.find(
    (project) => normalizeProjectPathForComparison(project.workspaceRoot) === normalized,
  );
  return match ? { kind: "found", project: match } : { kind: "unlinked" };
}

const REMOTE_FETCH_TIMEOUT_MS = 30_000;

export type ControlRemoteHttpError = {
  readonly status: number;
  readonly error: string;
  readonly code: string;
};

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function remoteFetchJson(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly method: "GET" | "POST";
  readonly pathname: string;
  readonly body?: unknown;
  /** Orchestration reads require the V2 protocol header. */
  readonly orchestrationProtocol?: boolean;
}): Promise<{ readonly status: number; readonly json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    };
    if (input.orchestrationProtocol === true) {
      headers[ORCHESTRATION_PROTOCOL_HEADER] = ORCHESTRATION_PROTOCOL_VERSION_TEXT;
    }
    if (input.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(joinUrl(input.httpBaseUrl, input.pathname), {
      method: input.method,
      headers,
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = { raw: text.slice(0, 240) };
      }
    }
    return { status: response.status, json };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.name === "AbortError"
        ? `Remote environment timed out after ${REMOTE_FETCH_TIMEOUT_MS}ms`
        : cause instanceof Error
          ? cause.message
          : "Remote environment request failed";
    throw {
      status: 504,
      error: message,
      code: "remote_timeout",
    } satisfies ControlRemoteHttpError;
  } finally {
    clearTimeout(timer);
  }
}

function failRemote(status: number, error: string, code: string): ControlRemoteHttpError {
  return { status, error, code };
}

function failRemoteUnauthorized(status: number): ControlRemoteHttpError {
  return failRemote(
    status,
    "Remote environment rejected the stored access token",
    "remote_unauthorized",
  );
}

function remoteErrorDetail(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const record = json as { reason?: unknown; message?: unknown; error?: unknown };
  for (const value of [record.message, record.reason, record.error]) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

/** V2 shell snapshot (`GET /api/orchestration/shell`): projects plus active/archived threads. */
export async function fetchRemoteShellSnapshot(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
}): Promise<{
  readonly projects: OrchestrationProjectShell[];
  readonly threads: RemoteThreadShell[];
  readonly archivedThreads: RemoteThreadShell[];
}> {
  const { status, json } = await remoteFetchJson({
    ...input,
    method: "GET",
    pathname: "/api/orchestration/shell",
    orchestrationProtocol: true,
  });
  if (status === 401 || status === 403) {
    throw failRemoteUnauthorized(status);
  }
  if (status < 200 || status >= 300 || !json || typeof json !== "object") {
    const detail = remoteErrorDetail(json);
    throw failRemote(
      status >= 400 ? status : 502,
      `Failed to read remote orchestration shell (HTTP ${status}${detail ? `: ${detail}` : ""})`,
      "remote_snapshot_failed",
    );
  }
  const body = json as {
    projects?: OrchestrationProjectShell[];
    threads?: RemoteThreadShell[];
    archivedThreads?: RemoteThreadShell[];
  };
  return {
    projects: Array.isArray(body.projects) ? body.projects : [],
    threads: Array.isArray(body.threads) ? body.threads : [],
    archivedThreads: Array.isArray(body.archivedThreads) ? body.archivedThreads : [],
  };
}

/**
 * V2 `GET /api/orchestration/threads/:id` returns the full thread projection
 * (an app thread without live status), so the control API reads the thread
 * shell from the shell snapshot instead.
 */
export async function fetchRemoteThreadShell(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly threadId: string;
}): Promise<RemoteThreadShell | null> {
  const shell = await fetchRemoteShellSnapshot({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
  });
  return (
    shell.threads.find((thread) => thread.id === input.threadId) ??
    shell.archivedThreads.find((thread) => thread.id === input.threadId) ??
    null
  );
}

/** `POST /api/projects/mutate` → `project.create` (V2 projects are not orchestration commands). */
export async function createRemoteProject(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly commandId: string;
  readonly projectId: string;
  readonly title: string;
  readonly workspaceRoot: string;
}): Promise<void> {
  const { status, json } = await remoteFetchJson({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    method: "POST",
    pathname: "/api/projects/mutate",
    // Omit createWorkspaceRootIfMissing — a true value fails when another
    // project already owns the path.
    body: {
      type: "project.create",
      commandId: input.commandId,
      projectId: input.projectId,
      title: input.title,
      workspaceRoot: input.workspaceRoot,
    },
  });
  if (status === 401 || status === 403) {
    throw failRemoteUnauthorized(status);
  }
  if (status < 200 || status >= 300) {
    const detail = remoteErrorDetail(json);
    throw failRemote(
      status >= 400 && status < 600 ? status : 502,
      detail
        ? `Remote project create failed: ${detail}`
        : `Remote project create failed (HTTP ${status})`,
      "project_create_failed",
    );
  }
}

/** `http(s)://host[/prefix]` → `ws(s)://host[/prefix]/ws?wsTicket=…&orchestrationProtocol=2`. */
export function buildRemoteWebSocketUrl(httpBaseUrl: string, wsTicket: string): string {
  const url = new URL(httpBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/ws`;
  url.search = "";
  url.hash = "";
  url.searchParams.set("wsTicket", wsTicket);
  url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, String(ORCHESTRATION_PROTOCOL_VERSION));
  return url.toString();
}

async function issueRemoteWebSocketTicket(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
}): Promise<string> {
  const { status, json } = await remoteFetchJson({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    method: "POST",
    pathname: "/api/auth/websocket-ticket",
  });
  if (status === 401 || status === 403) {
    throw failRemoteUnauthorized(status);
  }
  const ticket =
    json && typeof json === "object" ? (json as { ticket?: unknown }).ticket : undefined;
  if (status < 200 || status >= 300 || typeof ticket !== "string" || ticket.length === 0) {
    throw failRemote(
      status >= 400 && status < 600 ? status : 502,
      `Failed to mint remote WebSocket ticket (HTTP ${status})`,
      "remote_ticket_failed",
    );
  }
  return ticket;
}

function mapRemoteRpcFailure(cause: Cause.Cause<unknown>): ControlRemoteHttpError {
  const error = Cause.squash(cause) as { readonly _tag?: string; readonly message?: string };
  const message = typeof error?.message === "string" ? error.message : "";
  switch (error?._tag) {
    case "EnvironmentAuthorizationError":
      return failRemote(
        403,
        message || "Remote environment denied the command",
        "remote_unauthorized",
      );
    case "OrchestrationV2DispatchCommandError":
      return failRemote(
        500,
        `Remote orchestration dispatch failed: ${message || "command rejected"}`,
        "remote_dispatch_failed",
      );
    case "TimeoutError":
      return failRemote(
        504,
        `Remote environment timed out after ${REMOTE_FETCH_TIMEOUT_MS}ms`,
        "remote_timeout",
      );
    default:
      return failRemote(
        502,
        message
          ? `Remote WebSocket dispatch failed: ${message}`
          : "Remote WebSocket dispatch failed",
        "remote_dispatch_failed",
      );
  }
}

/**
 * Send exactly one `orchestration.dispatchCommand` RPC over a short-lived
 * environment WebSocket (same wire as client-runtime: JSON-serialized Effect
 * RPC over `/ws?wsTicket=…&orchestrationProtocol=2`), then close it.
 */
const dispatchOverRemoteWebSocket = (input: {
  readonly socketUrl: string;
  readonly command: OrchestrationV2Command;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const layerSocket = Socket.layerWebSocket(input.socketUrl, {
        openTimeout: "15 seconds",
      }).pipe(Layer.provide(NodeSocket.layerWebSocketConstructor));
      const layerProtocol = Layer.effect(
        RpcClient.Protocol,
        RpcClient.makeProtocolSocket({
          retryTransientErrors: false,
          retryPolicy: Schedule.recurs(0),
        }),
      ).pipe(Layer.provide(Layer.mergeAll(layerSocket, RpcSerialization.layerJson)));
      const protocolContext = yield* Layer.build(layerProtocol);
      const client = yield* RpcClient.make(WsRpcGroup).pipe(Effect.provide(protocolContext));
      return yield* client[ORCHESTRATION_V2_WS_METHODS.dispatchCommand](input.command);
    }),
  ).pipe(Effect.timeout(Duration.millis(REMOTE_FETCH_TIMEOUT_MS)));

/** Dispatch one V2 orchestration command (`thread.create`, `message.dispatch`, …) on a remote. */
export async function dispatchRemoteOrchestrationCommand(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly command: OrchestrationV2Command;
}): Promise<void> {
  const ticket = await issueRemoteWebSocketTicket(input);
  const exit = await Effect.runPromiseExit(
    dispatchOverRemoteWebSocket({
      socketUrl: buildRemoteWebSocketUrl(input.httpBaseUrl, ticket),
      command: input.command,
    }),
  );
  if (exit._tag === "Failure") {
    throw mapRemoteRpcFailure(exit.cause);
  }
}

export async function resolveOrCreateRemoteT3Project(input: {
  readonly httpBaseUrl: string;
  readonly accessToken: string;
  readonly workspaceRoot: string;
  readonly projectIdOverride: string | null;
  readonly preferredTitle: string | null | undefined;
  readonly newIds: () => { readonly projectId: string; readonly commandId: string };
}): Promise<OrchestrationProjectShell> {
  const shell = await fetchRemoteShellSnapshot(input);
  const matched = matchRemoteT3Project(shell.projects, {
    workspaceRoot: input.workspaceRoot,
    projectIdOverride: input.projectIdOverride,
  });
  if (matched.kind === "found") return matched.project;
  if (matched.kind === "missing_id") {
    throw failRemote(
      404,
      `T3 project not found on remote: ${matched.projectId}`,
      "project_not_found",
    );
  }

  const ids = input.newIds();
  const basename =
    input.workspaceRoot
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop()
      ?.trim() || "project";
  const title = input.preferredTitle?.trim() || basename;

  await createRemoteProject({
    httpBaseUrl: input.httpBaseUrl,
    accessToken: input.accessToken,
    commandId: ids.commandId,
    projectId: ids.projectId,
    title,
    workspaceRoot: input.workspaceRoot,
  });

  const after = await fetchRemoteShellSnapshot(input);
  const created = after.projects.find((project) => project.id === ids.projectId);
  if (created) return created;

  const rematch = matchRemoteT3Project(after.projects, {
    workspaceRoot: input.workspaceRoot,
    projectIdOverride: null,
  });
  if (rematch.kind === "found") return rematch.project;

  throw failRemote(
    500,
    `Created remote T3 project ${ids.projectId} but it is not visible yet`,
    "project_create_failed",
  );
}

export function resolveRemoteModelSelection(input: {
  readonly preferred: ModelSelection | null;
  readonly projectDefault: ModelSelection | null | undefined;
}): ModelSelection {
  if (input.preferred) return input.preferred;
  if (input.projectDefault) return input.projectDefault;
  // Remotes often lack a provider catalog over HTTP; cursor/default matches the
  // common paired-server setup used by BacksterDEV.
  return createModelSelection(ProviderInstanceId.make("cursor"), "default");
}

export function remoteWorkspaceExistsInProjects(
  projects: ReadonlyArray<{ readonly workspaceRoot: string }>,
  workspaceRoot: string,
): boolean {
  const normalized = normalizeProjectPathForComparison(workspaceRoot);
  if (!normalized) return false;
  return projects.some(
    (project) => normalizeProjectPathForComparison(project.workspaceRoot) === normalized,
  );
}
