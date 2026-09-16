import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { readBacksterosAgentProfile, writeBacksterosAgentProfile } from "./agent-profile.ts";
import {
  authorizationHeaderFromWebhookKey,
  readFileTaskCallbackResult,
  registerFileTaskRequest,
  storeFileTaskCallbackResult,
  type FileTaskCallbackResult,
} from "./file-task-callback.ts";

const AGENT_PROFILE_PATH = "/api/backsteros/agent-profile";
const FILE_TASK_WAKE_PATH = "/api/backsteros/file-task-wake";
const FILE_TASK_CALLBACK_PATH = "/api/backsteros/file-task-callback";
/** Same-origin proxy to Cloud Core mailbox (avoids browser CORS to agent.backsteros.com). */
const FILE_TASK_CLOUD_MAILBOX_PATH = "/api/backsteros/cloud-file-task-callbacks";
const DEFAULT_CLOUD_MAILBOX_BASE = "https://agent.backsteros.com";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveMailboxBaseFromRequest(request: HttpServerRequest.HttpServerRequest): string {
  const header =
    request.headers["x-backsteros-mailbox-base"] ?? request.headers["X-Backsteros-Mailbox-Base"];
  const fromHeader = typeof header === "string" ? header.trim() : "";
  return (fromHeader || DEFAULT_CLOUD_MAILBOX_BASE).replace(/\/$/, "");
}

function authorizationFromRequest(request: HttpServerRequest.HttpServerRequest): string | null {
  const header = request.headers.authorization ?? request.headers.Authorization;
  return typeof header === "string" && header.trim() ? header.trim() : null;
}

export const backsterosAgentProfileGetRouteLayer = HttpRouter.add(
  "GET",
  AGENT_PROFILE_PATH,
  Effect.gen(function* () {
    const profile = readBacksterosAgentProfile();
    return HttpServerResponse.jsonUnsafe({ ok: true, ...profile });
  }),
);

export const backsterosAgentProfilePutRouteLayer = HttpRouter.add(
  "PUT",
  AGENT_PROFILE_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Expected JSON body" },
        { status: 400 },
      );
    }
    const body = bodyJson as Record<string, unknown>;
    const contactIdRaw = body.contactId;
    if (contactIdRaw !== undefined && contactIdRaw !== null && typeof contactIdRaw !== "string") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "contactId must be a string or null" },
        { status: 400 },
      );
    }

    const profile = writeBacksterosAgentProfile({
      contactId: typeof contactIdRaw === "string" ? contactIdRaw : null,
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, ...profile });
  }),
);

export const backsterosFileTaskWakeRouteLayer = HttpRouter.add(
  "POST",
  FILE_TASK_WAKE_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Expected JSON body" },
        { status: 400 },
      );
    }
    const body = bodyJson as Record<string, unknown>;
    const webhookUrl = asNonEmptyString(body.webhookUrl);
    const webhookKey = asNonEmptyString(body.webhookKey);
    const payloadRaw = body.payload;
    if (!webhookUrl || !webhookKey) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "webhookUrl and webhookKey are required" },
        { status: 400 },
      );
    }
    if (!payloadRaw || typeof payloadRaw !== "object") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "payload object is required" },
        { status: 400 },
      );
    }
    const payload = payloadRaw as Record<string, unknown>;
    const brief = asNonEmptyString(payload.brief);
    const projectId = asNonEmptyString(payload.projectId);
    const projectKey = asNonEmptyString(payload.projectKey);
    const callbackUrl = asNonEmptyString(payload.callbackUrl);
    const requestId = asNonEmptyString(payload.requestId);
    if (!brief || !callbackUrl || !requestId || (!projectId && !projectKey)) {
      return HttpServerResponse.jsonUnsafe(
        {
          ok: false,
          error: "payload requires brief, callbackUrl, requestId, and projectId or projectKey",
        },
        { status: 400 },
      );
    }

    registerFileTaskRequest(requestId);

    const authorization = authorizationHeaderFromWebhookKey(webhookKey);
    const wakeResult = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: authorization,
          },
          body: JSON.stringify(payload),
        });
        const detail = await response.text().catch(() => "");
        return { ok: response.ok, status: response.status, detail };
      },
      catch: (cause) => (cause instanceof Error ? cause.message : "Webhook request failed"),
    }).pipe(
      Effect.catch((message) =>
        Effect.succeed({ ok: false as const, status: 0, detail: String(message) }),
      ),
    );

    if (!wakeResult.ok) {
      const detail = wakeResult.detail.trim();
      return HttpServerResponse.jsonUnsafe(
        {
          ok: false,
          error:
            wakeResult.status === 0
              ? detail || "Webhook request failed"
              : `Webhook rejected (${wakeResult.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`,
        },
        { status: 502 },
      );
    }

    return HttpServerResponse.jsonUnsafe({ ok: true, requestId });
  }),
);

export const backsterosFileTaskCallbackPostRouteLayer = HttpRouter.add(
  "POST",
  FILE_TASK_CALLBACK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "Expected JSON body" },
        { status: 400 },
      );
    }
    const body = bodyJson as Record<string, unknown>;
    const requestId = asNonEmptyString(body.requestId);
    if (!requestId) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "requestId is required" },
        { status: 400 },
      );
    }

    const ok = body.ok === true;
    let result: FileTaskCallbackResult;
    if (ok) {
      result = {
        ok: true,
        requestId,
        ...(asNonEmptyString(body.taskId) ? { taskId: asNonEmptyString(body.taskId)! } : {}),
        ...(asNonEmptyString(body.taskRef) ? { taskRef: asNonEmptyString(body.taskRef)! } : {}),
        ...(asNonEmptyString(body.title) ? { title: asNonEmptyString(body.title)! } : {}),
        ...(asNonEmptyString(body.projectId)
          ? { projectId: asNonEmptyString(body.projectId)! }
          : {}),
        ...(asNonEmptyString(body.summary) ? { summary: asNonEmptyString(body.summary)! } : {}),
      };
    } else {
      result = {
        ok: false,
        requestId,
        error: asNonEmptyString(body.error) ?? "Agent reported failure",
      };
    }

    const stored = storeFileTaskCallbackResult(result);
    if (!stored.accepted) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: stored.error ?? "Could not store result" },
        { status: 409 },
      );
    }
    return HttpServerResponse.jsonUnsafe({ ok: true });
  }),
);

export const backsterosFileTaskCallbackGetRouteLayer = HttpRouter.add(
  "GET",
  FILE_TASK_CALLBACK_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.jsonUnsafe({ ok: false, error: "Bad Request" }, { status: 400 });
    }
    const requestId = url.value.searchParams.get("requestId")?.trim() ?? "";
    if (!requestId) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, error: "requestId query parameter is required" },
        { status: 400 },
      );
    }

    const result = readFileTaskCallbackResult(requestId);
    if (result === undefined) {
      return HttpServerResponse.jsonUnsafe(
        { ok: false, pending: false, error: "Unknown requestId" },
        { status: 404 },
      );
    }
    if (result === null) {
      return HttpServerResponse.jsonUnsafe({ ok: true, pending: true });
    }
    return HttpServerResponse.jsonUnsafe({ ok: true, pending: false, result });
  }),
);

export const backsterosCloudFileTaskMailboxPostRouteLayer = HttpRouter.add(
  "POST",
  FILE_TASK_CLOUD_MAILBOX_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const authorization = authorizationFromRequest(request);
    if (!authorization) {
      return HttpServerResponse.jsonUnsafe(
        { error: "Authorization Bearer key is required", code: "unauthorized" },
        { status: 401 },
      );
    }
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return HttpServerResponse.jsonUnsafe(
        { error: "Expected JSON body", code: "bad_request" },
        { status: 400 },
      );
    }
    const requestId = asNonEmptyString((bodyJson as Record<string, unknown>).requestId);
    if (!requestId) {
      return HttpServerResponse.jsonUnsafe(
        { error: "requestId is required", code: "bad_request" },
        { status: 400 },
      );
    }

    const mailboxBase = resolveMailboxBaseFromRequest(request);
    const upstream = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${mailboxBase}/api/v1/file-task-callbacks`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: authorization,
          },
          body: JSON.stringify({ requestId }),
        });
        const text = await response.text().catch(() => "");
        return { status: response.status, text };
      },
      catch: (cause) => (cause instanceof Error ? cause.message : "Cloud mailbox request failed"),
    }).pipe(Effect.catch((message) => Effect.succeed({ status: 0, text: String(message) })));

    if (upstream.status === 0) {
      return HttpServerResponse.jsonUnsafe(
        { error: upstream.text || "Cloud mailbox request failed", code: "bad_gateway" },
        { status: 502 },
      );
    }

    let body: unknown = null;
    try {
      body = upstream.text ? JSON.parse(upstream.text) : null;
    } catch {
      body = { error: upstream.text.slice(0, 240) || "Invalid upstream response" };
    }
    return HttpServerResponse.jsonUnsafe(body, { status: upstream.status });
  }),
);

export const backsterosCloudFileTaskMailboxGetRouteLayer = HttpRouter.add(
  "GET",
  FILE_TASK_CLOUD_MAILBOX_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const authorization = authorizationFromRequest(request);
    if (!authorization) {
      return HttpServerResponse.jsonUnsafe(
        { error: "Authorization Bearer key is required", code: "unauthorized" },
        { status: 401 },
      );
    }
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.jsonUnsafe(
        { error: "Bad Request", code: "bad_request" },
        { status: 400 },
      );
    }
    const requestId = url.value.searchParams.get("requestId")?.trim() ?? "";
    if (!requestId) {
      return HttpServerResponse.jsonUnsafe(
        { error: "requestId query parameter is required", code: "bad_request" },
        { status: 400 },
      );
    }

    const mailboxBase = resolveMailboxBaseFromRequest(request);
    const upstream = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${mailboxBase}/api/v1/file-task-callbacks/${encodeURIComponent(requestId)}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: authorization,
            },
            cache: "no-store",
          },
        );
        const text = await response.text().catch(() => "");
        return { status: response.status, text };
      },
      catch: (cause) => (cause instanceof Error ? cause.message : "Cloud mailbox poll failed"),
    }).pipe(Effect.catch((message) => Effect.succeed({ status: 0, text: String(message) })));

    if (upstream.status === 0) {
      return HttpServerResponse.jsonUnsafe(
        { error: upstream.text || "Cloud mailbox poll failed", code: "bad_gateway" },
        { status: 502 },
      );
    }

    let body: unknown = null;
    try {
      body = upstream.text ? JSON.parse(upstream.text) : null;
    } catch {
      body = { error: upstream.text.slice(0, 240) || "Invalid upstream response" };
    }
    return HttpServerResponse.jsonUnsafe(body, { status: upstream.status });
  }),
);

export const backsterosAgentProfileRouteLayer = Layer.mergeAll(
  backsterosAgentProfileGetRouteLayer,
  backsterosAgentProfilePutRouteLayer,
);

export const backsterosFileTaskRouteLayer = Layer.mergeAll(
  backsterosFileTaskWakeRouteLayer,
  backsterosFileTaskCallbackPostRouteLayer,
  backsterosFileTaskCallbackGetRouteLayer,
  backsterosCloudFileTaskMailboxPostRouteLayer,
  backsterosCloudFileTaskMailboxGetRouteLayer,
);
