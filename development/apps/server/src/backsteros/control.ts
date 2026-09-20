/**
 * Localhost control plane: bind BacksterOS tasks to T3 threads and start agents.
 */
import {
  AuthOrchestrationOperateScope,
  CommandId,
  MessageId,
  type ModelSelection,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { isLoopbackHostname } from "../http.ts";
import { normalizeDispatchCommand } from "../orchestration/Normalizer.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import {
  buildControlKickoffPrompt,
  resolveBacksterosControlApiKey,
  resolveBacksterosControlTask,
} from "./control-backsteros.ts";
import {
  findBacksterosTaskThreadBinding,
  listBacksterosTaskThreadBindings,
  writeBacksterosTaskThreadBinding,
  type BacksterosTaskThreadBinding,
} from "./task-thread-bindings.ts";

export type ControlSessionStatus = "idle" | "working" | "blocked" | "done";

export type ControlSessionView = {
  readonly ok: true;
  readonly taskId: string;
  readonly taskRef: string | null;
  readonly threadId: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: ControlSessionStatus;
  readonly sessionStatus: string | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly settled: boolean;
};

type ControlHttpError = {
  readonly status: number;
  readonly error: string;
  readonly code?: string;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRemoteAddress(remoteAddress: string | undefined | null): string | null {
  if (!remoteAddress) return null;
  const trimmed = remoteAddress.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

export function isControlLoopbackRemote(remoteAddress: Option.Option<string>): boolean {
  if (Option.isNone(remoteAddress)) {
    // Some harnesses omit remoteAddress for in-process requests.
    return true;
  }
  const normalized = normalizeRemoteAddress(remoteAddress.value);
  if (!normalized) return false;
  return isLoopbackHostname(normalized);
}

function mapSessionStatus(thread: OrchestrationThreadShell | null): ControlSessionStatus {
  if (!thread) return "idle";
  const settled =
    thread.settledOverride === "settled" ||
    (thread.settledAt != null && thread.settledOverride !== "active");
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "blocked";
  const sessionStatus = thread.session?.status ?? null;
  if (sessionStatus === "error") return "blocked";
  if (
    sessionStatus === "starting" ||
    sessionStatus === "running" ||
    sessionStatus === "ready" ||
    thread.backgroundLiveness === "working" ||
    thread.backgroundLiveness === "monitoring"
  ) {
    return "working";
  }
  if (settled) return "done";
  return "idle";
}

function toSessionView(input: {
  readonly taskId: string;
  readonly binding: BacksterosTaskThreadBinding;
  readonly thread: OrchestrationThreadShell | null;
}): ControlSessionView {
  return {
    ok: true,
    taskId: input.taskId,
    taskRef: input.binding.displayId,
    threadId: input.binding.threadId,
    environmentId: input.binding.environmentId,
    projectId: input.binding.t3ProjectId,
    title: input.binding.title,
    status: mapSessionStatus(input.thread),
    sessionStatus: input.thread?.session?.status ?? null,
    hasPendingApprovals: input.thread?.hasPendingApprovals ?? false,
    hasPendingUserInput: input.thread?.hasPendingUserInput ?? false,
    settled:
      input.thread?.settledOverride === "settled" ||
      (input.thread?.settledAt != null && input.thread.settledOverride !== "active"),
  };
}

function controlErrorResponse(error: ControlHttpError) {
  return HttpServerResponse.jsonUnsafe(
    { ok: false, error: error.error, ...(error.code ? { code: error.code } : {}) },
    { status: error.status },
  );
}

function parseBearerToken(request: HttpServerRequest.HttpServerRequest): string | null {
  const header = request.headers.authorization ?? request.headers.Authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

const requireControlAuth = Effect.fn("backsteros.control.requireAuth")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  if (!isControlLoopbackRemote(request.remoteAddress)) {
    return yield* Effect.fail({
      status: 403,
      error: "Control API is loopback-only",
      code: "loopback_required",
    } satisfies ControlHttpError);
  }

  const bearer = parseBearerToken(request);
  const apiKey = resolveBacksterosControlApiKey();
  if (bearer && apiKey && bearer === apiKey) {
    return { kind: "api-key" as const };
  }

  const sessions = yield* SessionStore.SessionStore;
  const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
  const credential = EnvironmentAuth.selectRequestCredential(
    request,
    sessions.cookieName,
    sessions.legacyCookieName,
  );
  if (!credential?.token) {
    return yield* Effect.fail({
      status: 401,
      error:
        "Authorization Bearer pairing session or BacksterOS API key is required (loopback only)",
      code: "unauthorized",
    } satisfies ControlHttpError);
  }

  const session = yield* environmentAuth.authenticateHttpRequest(request).pipe(
    Effect.mapError((): ControlHttpError => ({
      status: 401,
      error: "Invalid pairing session",
      code: "unauthorized",
    })),
  );
  if (!session.scopes.includes(AuthOrchestrationOperateScope)) {
    return yield* Effect.fail({
      status: 403,
      error: `Missing scope ${AuthOrchestrationOperateScope}`,
      code: "insufficient_scope",
    } satisfies ControlHttpError);
  }
  return { kind: "session" as const, session };
});

const newId = Effect.fn("backsteros.control.newId")(function* () {
  const crypto = yield* Crypto.Crypto;
  return yield* crypto.randomUUIDv4.pipe(Effect.orDie);
});

const resolveModelSelection = Effect.fn("backsteros.control.resolveModelSelection")(function* (
  preferred: ModelSelection | null | undefined,
  projectDefault: ModelSelection | null | undefined,
) {
  if (preferred) return preferred;
  if (projectDefault) return projectDefault;

  const registry = yield* ProviderRegistry;
  const providers = yield* registry.getProviders;
  const ready = providers.find(
    (provider) =>
      provider.auth.status === "authenticated" &&
      provider.models.length > 0 &&
      provider.installed === true,
  );
  const anyWithModels = ready ?? providers.find((provider) => provider.models.length > 0);
  if (!anyWithModels || anyWithModels.models.length === 0) {
    return yield* Effect.fail({
      status: 409,
      error: "No provider models available — configure a provider in Development first",
      code: "no_provider",
    } satisfies ControlHttpError);
  }
  const defaultModel =
    anyWithModels.models.find((model) => model.isDefault === true) ?? anyWithModels.models[0]!;
  return createModelSelection(anyWithModels.instanceId, defaultModel.slug);
});

const findThreadShell = Effect.fn("backsteros.control.findThreadShell")(function* (
  threadId: string,
) {
  const projection = yield* ProjectionSnapshotQuery;
  const shell = yield* projection.getShellSnapshot();
  return shell.threads.find((thread) => thread.id === threadId) ?? null;
});

const findProjectByWorkspaceRoot = Effect.fn("backsteros.control.findProject")(function* (
  workspaceRoot: string,
  projectIdOverride: string | null,
) {
  const projection = yield* ProjectionSnapshotQuery;
  const shell = yield* projection.getShellSnapshot();
  const active = shell.projects;
  if (projectIdOverride) {
    const byId = active.find((project) => project.id === projectIdOverride);
    if (!byId) {
      return yield* Effect.fail({
        status: 404,
        error: `T3 project not found: ${projectIdOverride}`,
        code: "project_not_found",
      } satisfies ControlHttpError);
    }
    return byId;
  }
  const normalized = workspaceRoot.replace(/\/+$/, "");
  const match = active.find((project) => project.workspaceRoot.replace(/\/+$/, "") === normalized);
  if (!match) {
    return yield* Effect.fail({
      status: 404,
      error: `No T3 project linked to workspace ${workspaceRoot}. Add it in Development first.`,
      code: "project_not_linked",
    } satisfies ControlHttpError);
  }
  return match;
});

function catchControlErrors<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A | ReturnType<typeof controlErrorResponse>, never, R> {
  return effect.pipe(
    Effect.catch((error): Effect.Effect<ReturnType<typeof controlErrorResponse>> => {
      if (error && typeof error === "object" && "status" in error && "error" in error) {
        return Effect.succeed(controlErrorResponse(error as ControlHttpError));
      }
      return Effect.succeed(
        controlErrorResponse({
          status: 500,
          error: error instanceof Error ? error.message : "Internal control API error",
          code: "internal_error",
        }),
      );
    }),
  );
}

export const controlStartHandler = catchControlErrors(
  Effect.gen(function* () {
    yield* requireControlAuth();

    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return yield* Effect.fail({
        status: 400,
        error: "Expected JSON body",
        code: "bad_request",
      } satisfies ControlHttpError);
    }
    const body = bodyJson as Record<string, unknown>;
    const taskIdOrRef =
      asNonEmptyString(body.taskId) ??
      asNonEmptyString(body.taskRef) ??
      asNonEmptyString(body.task);
    if (!taskIdOrRef) {
      return yield* Effect.fail({
        status: 400,
        error: "taskId or taskRef is required",
        code: "bad_request",
      } satisfies ControlHttpError);
    }
    const promptOverride = asNonEmptyString(body.prompt);
    const projectIdOverride = asNonEmptyString(body.projectId);
    const workspaceRootOverride = asNonEmptyString(body.workspaceRoot);
    const start = body.start !== false;
    const modelSelectionRaw = body.modelSelection;

    const resolved = yield* Effect.tryPromise({
      try: () => resolveBacksterosControlTask(taskIdOrRef),
      catch: (cause): ControlHttpError => ({
        status: 404,
        error: cause instanceof Error ? cause.message : "Failed to resolve BacksterOS task",
        code: "task_not_found",
      }),
    });

    const { task, project } = resolved;
    const workspaceRoot = workspaceRootOverride ?? project?.localWorkingDirectory?.trim() ?? null;
    if (!workspaceRoot) {
      return yield* Effect.fail({
        status: 409,
        error: "BacksterOS project has no localWorkingDirectory and workspaceRoot was not provided",
        code: "no_workspace",
      } satisfies ControlHttpError);
    }

    const config = yield* ServerConfig.ServerConfig;
    const environment = yield* ServerEnvironment.ServerEnvironment;
    const environmentId = yield* environment.getEnvironmentId;
    const existing = findBacksterosTaskThreadBinding(config.stateDir, { taskId: task.id });

    let threadId: string | null = existing?.binding.threadId ?? null;
    let created = false;

    if (threadId) {
      const shell = yield* findThreadShell(threadId);
      if (!shell) {
        threadId = null;
      }
    }

    const t3Project = yield* findProjectByWorkspaceRoot(workspaceRoot, projectIdOverride);

    if (!threadId) {
      threadId = ThreadId.make(yield* newId());
      created = true;
    }

    const displayId =
      project?.key && task.number > 0
        ? `${project.key}-${task.number}`
        : (existing?.binding.displayId ?? null);
    const title =
      displayId != null
        ? `${displayId} · ${task.title.trim() || "Untitled"}`
        : task.title.trim() || "Untitled";

    let preferredModel: ModelSelection | null = null;
    if (modelSelectionRaw && typeof modelSelectionRaw === "object") {
      const raw = modelSelectionRaw as Record<string, unknown>;
      const instanceId = asNonEmptyString(raw.instanceId) ?? asNonEmptyString(raw.provider);
      const model = asNonEmptyString(raw.model);
      if (instanceId && model) {
        preferredModel = createModelSelection(ProviderInstanceId.make(instanceId), model);
      }
    }

    const modelSelection = yield* resolveModelSelection(
      preferredModel,
      t3Project.defaultModelSelection,
    );

    const prompt =
      promptOverride ??
      buildControlKickoffPrompt({
        task,
        projectKey: project?.key ?? null,
        workingDirectory: workspaceRoot,
      });

    const orchestrationEngine = yield* OrchestrationEngineService;
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    const commandId = CommandId.make(yield* newId());
    const messageId = MessageId.make(yield* newId());

    if (start) {
      const command = yield* normalizeDispatchCommand({
        type: "thread.turn.start",
        commandId,
        threadId: ThreadId.make(threadId),
        message: {
          messageId,
          role: "user",
          text: prompt,
          attachments: [],
        },
        modelSelection,
        titleSeed: title,
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
        ...(created
          ? {
              bootstrap: {
                createThread: {
                  projectId: ProjectId.make(t3Project.id),
                  title,
                  modelSelection,
                  runtimeMode: "full-access" as const,
                  interactionMode: "default" as const,
                  branch: null,
                  worktreePath: null,
                  createdAt,
                },
              },
            }
          : {}),
      }).pipe(
        Effect.mapError((cause): ControlHttpError => ({
          status: 400,
          error: cause instanceof Error ? cause.message : "Invalid start command",
          code: "invalid_command",
        })),
      );

      yield* orchestrationEngine.dispatch(command).pipe(
        Effect.mapError((cause): ControlHttpError => ({
          status: 500,
          error: cause instanceof Error ? cause.message : "Failed to start agent turn",
          code: "dispatch_failed",
        })),
      );
    } else if (created) {
      const command = yield* normalizeDispatchCommand({
        type: "thread.create",
        commandId,
        threadId: ThreadId.make(threadId),
        projectId: ProjectId.make(t3Project.id),
        title,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      }).pipe(
        Effect.mapError((cause): ControlHttpError => ({
          status: 400,
          error: cause instanceof Error ? cause.message : "Invalid create command",
          code: "invalid_command",
        })),
      );
      yield* orchestrationEngine.dispatch(command).pipe(
        Effect.mapError((cause): ControlHttpError => ({
          status: 500,
          error: cause instanceof Error ? cause.message : "Failed to create thread",
          code: "dispatch_failed",
        })),
      );
    }

    const binding = writeBacksterosTaskThreadBinding(config.stateDir, task.id, {
      threadId,
      environmentId,
      t3ProjectId: t3Project.id,
      backsterosProjectId: project?.id ?? task.projectId ?? "",
      projectTitle: project?.name ?? "",
      title: task.title,
      displayId,
    });

    const thread = yield* findThreadShell(threadId);
    return HttpServerResponse.jsonUnsafe({
      ...toSessionView({ taskId: task.id, binding, thread }),
      created,
      started: start,
    });
  }),
);

export const controlStatusHandler = catchControlErrors(
  Effect.gen(function* () {
    yield* requireControlAuth();

    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return yield* Effect.fail({
        status: 400,
        error: "Bad Request",
        code: "bad_request",
      } satisfies ControlHttpError);
    }
    const taskId = url.value.searchParams.get("taskId")?.trim() || null;
    const taskRef = url.value.searchParams.get("taskRef")?.trim() || null;
    const threadId = url.value.searchParams.get("threadId")?.trim() || null;
    if (!taskId && !taskRef && !threadId) {
      return yield* Effect.fail({
        status: 400,
        error: "taskId, taskRef, or threadId query parameter is required",
        code: "bad_request",
      } satisfies ControlHttpError);
    }

    const config = yield* ServerConfig.ServerConfig;
    let found = findBacksterosTaskThreadBinding(config.stateDir, {
      ...(taskId ? { taskId } : {}),
      ...(threadId ? { threadId } : {}),
      ...(taskRef ? { displayId: taskRef } : {}),
    });

    if (!found && taskRef) {
      const resolved = yield* Effect.promise(() =>
        resolveBacksterosControlTask(taskRef).then(
          (value) => value,
          () => null,
        ),
      );
      if (resolved) {
        found = findBacksterosTaskThreadBinding(config.stateDir, { taskId: resolved.task.id });
      }
    }
    if (!found) {
      return yield* Effect.fail({
        status: 404,
        error: "No bound session for that task/thread",
        code: "not_found",
      } satisfies ControlHttpError);
    }

    const thread = yield* findThreadShell(found.binding.threadId);
    return HttpServerResponse.jsonUnsafe(
      toSessionView({ taskId: found.taskId, binding: found.binding, thread }),
    );
  }),
);

export const controlMessageHandler = catchControlErrors(
  Effect.gen(function* () {
    yield* requireControlAuth();

    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return yield* Effect.fail({
        status: 400,
        error: "Expected JSON body",
        code: "bad_request",
      } satisfies ControlHttpError);
    }
    const body = bodyJson as Record<string, unknown>;
    const threadId = asNonEmptyString(body.threadId);
    const text =
      asNonEmptyString(body.text) ??
      asNonEmptyString(body.prompt) ??
      asNonEmptyString(body.message);
    if (!threadId) {
      return yield* Effect.fail({
        status: 400,
        error: "threadId is required",
        code: "bad_request",
      } satisfies ControlHttpError);
    }
    if (!text) {
      return yield* Effect.fail({
        status: 400,
        error: "text is required",
        code: "bad_request",
      } satisfies ControlHttpError);
    }

    const config = yield* ServerConfig.ServerConfig;
    const found = findBacksterosTaskThreadBinding(config.stateDir, { threadId });
    if (!found) {
      return yield* Effect.fail({
        status: 404,
        error: "No bound session for that thread",
        code: "not_found",
      } satisfies ControlHttpError);
    }

    const shell = yield* findThreadShell(threadId);
    if (!shell) {
      return yield* Effect.fail({
        status: 404,
        error: "Thread not found",
        code: "thread_not_found",
      } satisfies ControlHttpError);
    }

    const orchestrationEngine = yield* OrchestrationEngineService;
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    const command = yield* normalizeDispatchCommand({
      type: "thread.turn.start",
      commandId: CommandId.make(yield* newId()),
      threadId: ThreadId.make(threadId),
      message: {
        messageId: MessageId.make(yield* newId()),
        role: "user",
        text,
        attachments: [],
      },
      modelSelection: shell.modelSelection,
      runtimeMode: shell.runtimeMode,
      interactionMode: shell.interactionMode,
      createdAt,
    }).pipe(
      Effect.mapError((cause): ControlHttpError => ({
        status: 400,
        error: cause instanceof Error ? cause.message : "Invalid message command",
        code: "invalid_command",
      })),
    );

    yield* orchestrationEngine.dispatch(command).pipe(
      Effect.mapError((cause): ControlHttpError => ({
        status: 500,
        error: cause instanceof Error ? cause.message : "Failed to send message",
        code: "dispatch_failed",
      })),
    );

    const thread = yield* findThreadShell(threadId);
    return HttpServerResponse.jsonUnsafe({
      ...toSessionView({ taskId: found.taskId, binding: found.binding, thread }),
      sent: true,
    });
  }),
);

export const controlBindingsGetHandler = catchControlErrors(
  Effect.gen(function* () {
    yield* requireControlAuth();
    const config = yield* ServerConfig.ServerConfig;
    const bindings = listBacksterosTaskThreadBindings(config.stateDir).map(
      ({ taskId, binding }) => ({
        taskId,
        ...binding,
      }),
    );
    return HttpServerResponse.jsonUnsafe({ ok: true, bindings });
  }),
);

export const controlBindingsPutHandler = catchControlErrors(
  Effect.gen(function* () {
    yield* requireControlAuth();

    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyJson = yield* request.json.pipe(Effect.catch(() => Effect.succeed(null as unknown)));
    if (!bodyJson || typeof bodyJson !== "object") {
      return yield* Effect.fail({
        status: 400,
        error: "Expected JSON body",
        code: "bad_request",
      } satisfies ControlHttpError);
    }
    const body = bodyJson as Record<string, unknown>;
    const taskId = asNonEmptyString(body.taskId);
    const threadId = asNonEmptyString(body.threadId);
    const environmentId = asNonEmptyString(body.environmentId);
    const t3ProjectId = asNonEmptyString(body.t3ProjectId);
    const backsterosProjectId = asNonEmptyString(body.backsterosProjectId);
    const title = asNonEmptyString(body.title);
    if (!taskId || !threadId || !environmentId || !t3ProjectId || !backsterosProjectId || !title) {
      return yield* Effect.fail({
        status: 400,
        error:
          "taskId, threadId, environmentId, t3ProjectId, backsterosProjectId, and title are required",
        code: "bad_request",
      } satisfies ControlHttpError);
    }

    const config = yield* ServerConfig.ServerConfig;
    const binding = writeBacksterosTaskThreadBinding(config.stateDir, taskId, {
      threadId,
      environmentId,
      t3ProjectId,
      backsterosProjectId,
      projectTitle: asNonEmptyString(body.projectTitle) ?? "",
      title,
      displayId: asNonEmptyString(body.displayId),
    });
    return HttpServerResponse.jsonUnsafe({ ok: true, taskId, binding });
  }),
);
