// @effect-diagnostics globalDate:off globalErrorInEffectFailure:off nodeBuiltinImport:off anyUnknownInErrorContext:off - BacksterOS bridge code runs outside the Effect runtime.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { ProviderRegistry } from "../provider/ProviderRegistry.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import {
  controlMessageHandler,
  controlPromoteHandler,
  controlPruneHandler,
  controlStartHandler,
  controlStatusHandler,
  isControlDispatchPending,
  isControlLoopbackRemote,
  mapSessionStatus,
  matchControlT3Project,
  resolveControlSessionStatus,
  resolveControlTurnModelPreference,
  resolveControlWorkspaceRoot,
} from "./control.ts";
import * as CursorAcpWarm from "./control-cursor-acp-warm.ts";
import { resetControlSessionPromoteStateForTests } from "./control-session-promote.ts";
import {
  CONTROL_PENDING_DISPATCH_TIMEOUT_MS,
  getControlPendingDispatch,
  recordControlPendingDispatch,
  resetControlPendingDispatches,
} from "./control-pending-dispatch.ts";
import { buildControlKickoffPrompt, parseBacksterosDisplayId } from "./control-backsteros.ts";
import {
  findBacksterosTaskThreadBinding,
  listBacksterosTaskThreadBindings,
  readBacksterosTaskThreadBindings,
  removeBacksterosTaskThreadBinding,
  writeBacksterosTaskThreadBinding,
} from "./task-thread-bindings.ts";

describe("backsteros task-thread bindings", () => {
  it("round-trips a binding through disk", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "bdv-bindings-"));
    try {
      const written = writeBacksterosTaskThreadBinding(stateDir, "task-1", {
        threadId: "thread-1",
        environmentId: "env-1",
        t3ProjectId: "proj-1",
        backsterosProjectId: "bos-1",
        projectTitle: "BDV",
        title: "Demo",
        displayId: "BDV-1",
      });
      expect(written.kind).toBe("thread");
      expect(written.threadId).toBe("thread-1");

      const read = readBacksterosTaskThreadBindings(stateDir);
      expect(read.byTaskId["task-1"]?.displayId).toBe("BDV-1");

      const byRef = findBacksterosTaskThreadBinding(stateDir, { displayId: "bdv-1" });
      expect(byRef?.taskId).toBe("task-1");

      const listed = listBacksterosTaskThreadBindings(stateDir);
      expect(listed).toHaveLength(1);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe("resolveControlTurnModelPreference (OS-91)", () => {
  const cursor = createModelSelection(ProviderInstanceId.make("cursor"), "default");
  const claude = createModelSelection(ProviderInstanceId.make("claudeAgent"), "opus");

  it("keeps the existing thread selection when the caller omits a model", () => {
    expect(
      resolveControlTurnModelPreference({
        preferred: null,
        existingThreadSelection: cursor,
      }),
    ).toEqual({ kind: "use", modelSelection: cursor });
  });

  it("does not fall back to a missing thread (new thread uses caller/project later)", () => {
    expect(
      resolveControlTurnModelPreference({
        preferred: null,
        existingThreadSelection: null,
      }),
    ).toEqual({ kind: "use", modelSelection: null });
    expect(
      resolveControlTurnModelPreference({
        preferred: claude,
        existingThreadSelection: null,
      }),
    ).toEqual({ kind: "use", modelSelection: claude });
  });

  it("returns driver_mismatch when an explicit selection uses another driver", () => {
    expect(
      resolveControlTurnModelPreference({
        preferred: claude,
        existingThreadSelection: cursor,
      }),
    ).toEqual({
      kind: "driver_mismatch",
      threadInstanceId: "cursor",
      threadDriver: "cursor",
      requestedInstanceId: "claudeAgent",
      requestedDriver: "claudeAgent",
    });
  });

  it("allows a same-driver instance switch when lookup maps both ids", () => {
    const cursorWork = createModelSelection(ProviderInstanceId.make("cursor-work"), "default");
    expect(
      resolveControlTurnModelPreference({
        preferred: cursorWork,
        existingThreadSelection: cursor,
        driverByInstanceId: { cursor: "cursor", "cursor-work": "cursor" },
      }),
    ).toEqual({ kind: "use", modelSelection: cursorWork });
  });

  it("accepts an explicit selection on the same instance", () => {
    const preferred = createModelSelection(ProviderInstanceId.make("cursor"), "gpt-5");
    expect(
      resolveControlTurnModelPreference({
        preferred,
        existingThreadSelection: cursor,
      }),
    ).toEqual({
      kind: "use",
      modelSelection: preferred,
    });
  });
});

describe("backsteros control helpers", () => {
  it("parses display ids", () => {
    expect(parseBacksterosDisplayId("BDV-33")).toEqual({ projectKey: "BDV", number: 33 });
    expect(parseBacksterosDisplayId("not-a-ref")).toBeNull();
  });

  it("builds a kickoff prompt with task metadata", () => {
    const prompt = buildControlKickoffPrompt({
      task: {
        id: "abc",
        number: 33,
        title: "Control API",
        description: "Ship it",
        status: "in_progress",
        projectId: "p1",
        executionLocation: null,
        executionLocationLockedAt: null,
      },
      projectKey: "BDV",
      workingDirectory: "/tmp/dev",
    });
    expect(prompt).toContain("Implement this Backsteros task");
    expect(prompt).toContain("Task ID: BDV-33");
    expect(prompt).toContain("Working directory: /tmp/dev");
  });

  it("treats loopback remotes as allowed", () => {
    assert.equal(isControlLoopbackRemote(Option.none()), true);
    assert.equal(isControlLoopbackRemote(Option.some("127.0.0.1")), true);
    assert.equal(isControlLoopbackRemote(Option.some("::1")), true);
    assert.equal(isControlLoopbackRemote(Option.some("::ffff:127.0.0.1")), true);
    assert.equal(isControlLoopbackRemote(Option.some("192.168.1.10")), false);
  });
});

describe("backsteros control workspace resolve", () => {
  it("prefers workspaceRoot override over BacksterOS cwd", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: "/override",
        localWorkingDirectory: "/from-backsteros",
      }),
    ).toEqual({ workspaceRoot: "/override" });
  });

  it("uses BacksterOS localWorkingDirectory when override is omitted", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "  /Users/me/dev  ",
      }),
    ).toEqual({ workspaceRoot: "/Users/me/dev" });
  });

  it("returns a clear no_workspace JSON error when cwd is missing", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: null,
      }),
    ).toEqual({
      error: {
        status: 409,
        error: "BacksterOS project has no localWorkingDirectory and workspaceRoot was not provided",
        code: "no_workspace",
      },
    });
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "   ",
      }),
    ).toMatchObject({ error: { code: "no_workspace", status: 409 } });
  });

  it("prefers executionWorkspacePath over localWorkingDirectory (OS-106)", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "/Users/me/vault",
        executionWorkspacePath: "/home/deploy/code/app",
      }),
    ).toEqual({ workspaceRoot: "/home/deploy/code/app" });
  });

  it("on local start, skips a missing server path and falls back to the Mac folder (BDV-64)", () => {
    const existing = new Set(["/Users/me/vault"]);
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "/Users/me/vault",
        executionWorkspacePath: "/home/deploy/code/app",
        skipMissingLocalPaths: true,
        pathExists: (candidate) => existing.has(candidate),
      }),
    ).toEqual({ workspaceRoot: "/Users/me/vault" });
  });

  it("on local start, still prefers an execution path that exists on disk", () => {
    const existing = new Set(["/Users/me/vault", "/home/deploy/code/app"]);
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "/Users/me/vault",
        executionWorkspacePath: "/home/deploy/code/app",
        skipMissingLocalPaths: true,
        pathExists: (candidate) => existing.has(candidate),
      }),
    ).toEqual({ workspaceRoot: "/home/deploy/code/app" });
  });

  it("on remote start, keeps a server-only execution path even when missing locally", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "/Users/me/vault",
        executionWorkspacePath: "/home/deploy/code/app",
        skipMissingLocalPaths: false,
        pathExists: () => false,
      }),
    ).toEqual({ workspaceRoot: "/home/deploy/code/app" });
  });

  it("matches a linked T3 project by normalized workspace path", () => {
    const projects = [
      { id: "other", workspaceRoot: "/Users/me/other" },
      { id: "dev", workspaceRoot: "/Users/me/dev" },
    ];
    expect(
      matchControlT3Project(projects, {
        workspaceRoot: "/Users/me/dev/",
        projectIdOverride: null,
      }),
    ).toEqual({ kind: "found", project: projects[1] });
  });

  it("reports unlinked when no T3 project matches the cwd", () => {
    expect(
      matchControlT3Project([{ id: "other", workspaceRoot: "/Users/me/other" }], {
        workspaceRoot: "/Users/me/dev",
        projectIdOverride: null,
      }),
    ).toEqual({ kind: "unlinked" });
  });

  it("honors projectId override and missing-id errors", () => {
    const projects = [{ id: "dev", workspaceRoot: "/Users/me/dev" }];
    expect(
      matchControlT3Project(projects, {
        workspaceRoot: "/ignored",
        projectIdOverride: "dev",
      }),
    ).toEqual({ kind: "found", project: projects[0] });
    expect(
      matchControlT3Project(projects, {
        workspaceRoot: "/Users/me/dev",
        projectIdOverride: "missing",
      }),
    ).toEqual({ kind: "missing_id", projectId: "missing" });
  });
});

describe("mapSessionStatus", () => {
  type StatusInput = NonNullable<Parameters<typeof mapSessionStatus>[0]>;
  /** Shell fields for a finished (completed) latest run. */
  const finishedRun = (requestedAt = "2026-09-27T22:10:01.709Z"): Partial<StatusInput> => ({
    status: "completed",
    activeRunId: null,
    latestRunRequestedAt: requestedAt,
  });
  const thread = (overrides: Partial<StatusInput> = {}): StatusInput => ({
    settledOverride: null,
    settledAt: null,
    pendingRuntimeRequest: null,
    pendingBackgroundTasks: [],
    latestUserMessageAt: "2026-09-27T22:10:01.709Z",
    status: "completed",
    activeRunId: null,
    latestRunRequestedAt: "2026-09-27T22:10:01.709Z",
    ...overrides,
  });

  it("reports idle once a run has finished", () => {
    expect(mapSessionStatus(thread())).toBe("idle");
    expect(
      mapSessionStatus(
        thread({ status: "idle", latestRunRequestedAt: null, latestUserMessageAt: null }),
      ),
    ).toBe("idle");
  });

  it("reports working while a run is active", () => {
    for (const status of ["preparing", "queued", "starting", "running", "waiting"]) {
      expect(mapSessionStatus(thread({ status }))).toBe("working");
    }
    expect(mapSessionStatus(thread({ activeRunId: "run-1" }))).toBe("working");
  });

  it("accepts DateTime timestamps from local shells", () => {
    const sent = DateTime.makeUnsafe("2026-09-27T22:11:00.000Z");
    expect(mapSessionStatus(thread({ latestUserMessageAt: sent }))).toBe("working");
    expect(
      mapSessionStatus(
        thread({
          latestUserMessageAt: DateTime.makeUnsafe("2026-09-27T22:10:01.709Z"),
          latestRunRequestedAt: DateTime.makeUnsafe("2026-09-27T22:10:01.709Z"),
        }),
      ),
    ).toBe("idle");
  });

  it("reports working when a sent message has not started its run yet", () => {
    expect(mapSessionStatus(thread({ latestUserMessageAt: "2026-09-27T22:11:00.000Z" }))).toBe(
      "working",
    );
    expect(mapSessionStatus(thread({ latestRunRequestedAt: null }))).toBe("working");
  });

  it("keeps background work, blocked and settled mappings", () => {
    expect(mapSessionStatus(thread({ pendingBackgroundTasks: [{ taskId: "bg-1" }] }))).toBe(
      "working",
    );
    expect(
      mapSessionStatus(thread({ pendingRuntimeRequest: { id: "req-1", kind: "command" } })),
    ).toBe("blocked");
    expect(
      mapSessionStatus(thread({ pendingRuntimeRequest: { id: "req-2", kind: "user_input" } })),
    ).toBe("blocked");
    expect(mapSessionStatus(thread({ status: "failed" }))).toBe("blocked");
    expect(mapSessionStatus(thread({ settledAt: "2026-09-27T22:12:00.000Z" }))).toBe("done");
    expect(
      mapSessionStatus(
        thread({ settledOverride: "active", settledAt: "2026-09-27T22:12:00.000Z" }),
      ),
    ).toBe("idle");
    expect(
      mapSessionStatus(
        thread({ status: "idle", latestRunRequestedAt: null, latestUserMessageAt: null }),
      ),
    ).toBe("idle");
    expect(mapSessionStatus(null)).toBe("idle");
  });

  describe("pending control dispatch (send to a stopped session)", () => {
    // Previous run finished and the thread auto-settled.
    const stoppedSettled = (overrides: Partial<StatusInput> = {}) =>
      thread({
        ...finishedRun(),
        status: "interrupted",
        settledAt: "2026-09-27T22:10:10.500Z",
        ...overrides,
      });
    const dispatchedAt = Date.parse("2026-09-27T22:29:12.000Z");

    it("reads idle/done without a pending dispatch (the pre-fix gap)", () => {
      expect(mapSessionStatus(stoppedSettled({ settledAt: null }))).toBe("idle");
      expect(mapSessionStatus(stoppedSettled())).toBe("done");
    });

    it("reads working right after a send until the run starts", () => {
      for (const now of [dispatchedAt, dispatchedAt + 1_500, dispatchedAt + 60_000]) {
        expect(mapSessionStatus(stoppedSettled(), { pendingDispatchAt: dispatchedAt, now })).toBe(
          "working",
        );
        expect(
          mapSessionStatus(stoppedSettled({ settledAt: null }), {
            pendingDispatchAt: dispatchedAt,
            now,
          }),
        ).toBe("working");
      }
      // Projection has the user message but the run has not started yet.
      expect(
        mapSessionStatus(
          stoppedSettled({ latestUserMessageAt: "2026-09-27T22:29:12.050Z", settledAt: null }),
          { pendingDispatchAt: dispatchedAt, now: dispatchedAt + 200 },
        ),
      ).toBe("working");
      // Thread not in the projection yet (new thread bootstrap).
      expect(mapSessionStatus(null, { pendingDispatchAt: dispatchedAt, now: dispatchedAt })).toBe(
        "working",
      );
    });

    it("stops counting once a run requested at/after the dispatch exists", () => {
      const newRun = (status: "running" | "completed"): Partial<StatusInput> => ({
        status,
        activeRunId: status === "running" ? "run-2" : null,
        latestRunRequestedAt: "2026-09-27T22:29:12.004Z",
      });
      const now = dispatchedAt + 5_000;
      expect(isControlDispatchPending(stoppedSettled(newRun("running")), dispatchedAt, now)).toBe(
        false,
      );
      // Run active → working via the run itself.
      expect(
        mapSessionStatus(thread(newRun("running")), { pendingDispatchAt: dispatchedAt, now }),
      ).toBe("working");
      // Finished run → idle or done once settled, even with a stale pending record.
      expect(
        mapSessionStatus(
          thread({ ...newRun("completed"), latestUserMessageAt: "2026-09-27T22:29:12.004Z" }),
          {
            pendingDispatchAt: dispatchedAt,
            now,
          },
        ),
      ).toBe("idle");
      expect(
        mapSessionStatus(
          stoppedSettled({
            ...newRun("completed"),
            latestUserMessageAt: "2026-09-27T22:29:12.004Z",
            settledAt: "2026-09-27T22:29:20.000Z",
          }),
          { pendingDispatchAt: dispatchedAt, now },
        ),
      ).toBe("done");
    });

    it("gives way to blocked on run failure and expires after the timeout", () => {
      expect(
        mapSessionStatus(stoppedSettled({ status: "failed" }), {
          pendingDispatchAt: dispatchedAt,
          now: dispatchedAt + 1_000,
        }),
      ).toBe("blocked");
      expect(
        mapSessionStatus(
          stoppedSettled({ pendingRuntimeRequest: { id: "req-1", kind: "command" } }),
          { pendingDispatchAt: dispatchedAt, now: dispatchedAt + 1_000 },
        ),
      ).toBe("blocked");
      expect(
        mapSessionStatus(stoppedSettled({ settledAt: null }), {
          pendingDispatchAt: dispatchedAt,
          now: dispatchedAt + CONTROL_PENDING_DISPATCH_TIMEOUT_MS,
        }),
      ).toBe("idle");
    });

    it("resolveControlSessionStatus uses and prunes the process-local record", () => {
      resetControlPendingDispatches();
      try {
        recordControlPendingDispatch("thread-p", dispatchedAt);
        expect(resolveControlSessionStatus("thread-p", stoppedSettled(), dispatchedAt + 100)).toBe(
          "working",
        );
        expect(getControlPendingDispatch("thread-p")).toBe(dispatchedAt);
        const started = stoppedSettled({
          status: "completed",
          latestRunRequestedAt: "2026-09-27T22:29:12.010Z",
          latestUserMessageAt: "2026-09-27T22:29:12.010Z",
          settledAt: null,
        });
        expect(resolveControlSessionStatus("thread-p", started, dispatchedAt + 9_000)).toBe("idle");
        expect(getControlPendingDispatch("thread-p")).toBeNull();
      } finally {
        resetControlPendingDispatches();
      }
    });
  });
});

/**
 * Handler-level checks for the localhost control API (OS-38):
 * - a status GET is read-only (never writes BacksterOS task status/updatedAt)
 * - GET after a finished turn → idle; right after a send → working.
 */
describe("control API handlers (OS-38)", () => {
  const API_KEY = "test-control-key";
  const API_ORIGIN = "http://backsteros.test";
  const TASK_ID = "task-os38";
  const THREAD_ID = "11111111-2222-4333-8444-555555555555";

  type FakeTask = {
    id: string;
    status: string;
    updatedAt: string;
    executionLocation?: string | null;
  };

  type FakeProjectLocations = {
    localWorkingDirectory: string;
    developmentLocation?: string | null;
    productionLocation?: string | null;
  };

  type ThreadState = {
    /** V2 shell run status: idle | preparing | queued | starting | running | waiting | completed | interrupted | failed … */
    status: string;
    lastError: string | null;
    activeRunId: string | null;
    latestRunRequestedAt: string | null;
    latestUserMessageAt: string | null;
    settledAt: string | null;
  };

  let stateDir: string;
  let idCounter = 0;
  let fakeTask: FakeTask;
  let fakeProjectLocations: FakeProjectLocations;
  let threadState: ThreadState;
  let fetchCalls: Array<{ method: string; url: string; patchStatus?: string }>;
  type DispatchedCommand = {
    type: string;
    createdBy?: string;
    creationSource?: string;
    modelSelection?: { instanceId: string; model: string };
    dispatchMode?: { type: string };
    titleSeed?: string;
    text?: string;
    attachments?: unknown[];
    projectId?: string;
  };
  let dispatched: DispatchedCommand[];
  let getThreadShellCalls: string[];
  const savedEnv = {
    key: process.env.BACKSTEROS_API_KEY,
    url: process.env.BACKSTEROS_API_URL,
  };

  function threadShell() {
    return {
      id: THREAD_ID,
      projectId: "t3-project",
      title: "OS-38 · test",
      modelSelection: { instanceId: "cursor", model: "default" },
      runtimeMode: "full-access",
      interactionMode: "default",
      settledOverride: null,
      settledAt: threadState.settledAt,
      pendingRuntimeRequest: null,
      pendingBackgroundTasks: [],
      status: threadState.status,
      activeRunId: threadState.activeRunId,
      latestRunRequestedAt: threadState.latestRunRequestedAt,
      latestUserMessageAt: threadState.latestUserMessageAt,
      lastError: threadState.lastError,
    };
  }

  type ShellOptions = {
    readonly projects?: ReadonlyArray<unknown>;
    readonly threads?: ReadonlyArray<ReturnType<typeof threadShell>>;
    readonly dispatch?: (command: DispatchedCommand) => Effect.Effect<unknown, unknown>;
    readonly createProject?: (input: {
      readonly workspaceRoot: string;
      readonly projectId: string;
      readonly title: string;
    }) => Effect.Effect<unknown, unknown>;
  };

  /** Provide every service the local (in-process) control path needs. */
  function provideControlServices<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    request: Request,
    options: ShellOptions = {},
  ): Effect.Effect<A, E> {
    const threads = options.threads ?? [threadShell()];
    const createdShells: Array<{
      id: string;
      title: string;
      workspaceRoot: string;
      defaultModelSelection: { instanceId: string; model: string };
      scripts: readonly [];
      createdAt: string;
      updatedAt: string;
    }> = [];
    return effect.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(request),
      ),
      Effect.provideService(SessionStore.SessionStore, {} as never),
      Effect.provideService(EnvironmentAuth.EnvironmentAuth, {} as never),
      Effect.provideService(ServerConfig.ServerConfig, {
        stateDir,
        attachmentsDir: path.join(stateDir, "attachments"),
        port: 3773,
      } as never),
      Effect.provideService(ServerEnvironment.ServerEnvironment, {
        getEnvironmentId: Effect.succeed("env-1"),
        getDescriptor: Effect.succeed({ environmentId: "env-1", label: "local" }),
      } as never),
      Effect.provideService(ThreadManagementService.ThreadManagementService, {
        getThreadShell: (threadId: string) =>
          Effect.sync(() => {
            getThreadShellCalls.push(String(threadId));
            return threads.find((thread) => thread.id === threadId) ?? null;
          }),
        dispatch: (command: DispatchedCommand) => {
          dispatched.push(command);
          return options.dispatch
            ? options.dispatch(command)
            : Effect.succeed({ sequence: dispatched.length });
        },
      } as never),
      Effect.provideService(ProjectService.ProjectService, {
        listShells: () => Effect.sync(() => [...(options.projects ?? []), ...createdShells]),
        create: (input: {
          workspaceRoot: string;
          projectId: string;
          title: string;
        }) => {
          const shell = {
            id: input.projectId,
            title: input.title,
            workspaceRoot: input.workspaceRoot,
            defaultModelSelection: { instanceId: "claudeAgent", model: "opus" },
            scripts: [] as const,
            createdAt: "2026-09-27T22:00:00.000Z",
            updatedAt: "2026-09-27T22:00:00.000Z",
          };
          createdShells.push(shell);
          if (options.createProject) return options.createProject(input);
          return Effect.succeed(shell);
        },
      } as never),
      Effect.provideService(ProviderRegistry, {
        getProviders: Effect.succeed([
          { instanceId: "cursor", driver: "cursor" },
          { instanceId: "claudeAgent", driver: "claudeAgent" },
        ]),
      } as never),
      Effect.provideService(Crypto.Crypto, {
        randomUUIDv4: () =>
          Effect.sync(
            () => `00000000-0000-4000-8000-${String((idCounter += 1)).padStart(12, "0")}`,
          ),
      } as never),
      Effect.provideService(FileSystem.FileSystem, {} as never),
      Effect.provideService(Path.Path, {} as never),
      Effect.provideService(WorkspacePaths.WorkspacePaths, {} as never),
    ) as unknown as Effect.Effect<A, E>;
  }

  function runHandler(
    handler: typeof controlStatusHandler | typeof controlMessageHandler,
    request: Request,
  ): Promise<Response> {
    const provided = provideControlServices(handler as typeof controlMessageHandler, request);
    return Effect.runPromise(provided).then((response) => HttpServerResponse.toWeb(response));
  }

  async function getStatus(query = `threadId=${THREAD_ID}`) {
    const response = await runHandler(
      controlStatusHandler,
      new Request(`http://127.0.0.1:3773/api/backsteros/control/sessions?${query}`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      }),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as {
      status: string;
      sessionStatus: string | null;
      lastError: string | null;
    };
  }

  async function sendMessage(text: string) {
    const response = await runHandler(
      controlMessageHandler,
      new Request("http://127.0.0.1:3773/api/backsteros/control/message", {
        method: "POST",
        headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, text }),
      }),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as {
      status: string;
      sessionStatus: string | null;
      sent: boolean;
    };
  }

  /** Let any fire-and-forget BacksterOS write run before asserting. */
  const flush = () => Effect.runPromise(Effect.sleep("25 millis"));

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "bdv-control-handlers-"));
    writeBacksterosTaskThreadBinding(stateDir, TASK_ID, {
      threadId: THREAD_ID,
      environmentId: "env-1",
      t3ProjectId: "t3-project",
      backsterosProjectId: "os-project",
      projectTitle: "OS",
      title: "test",
      displayId: "OS-38",
    });
    fakeTask = { id: TASK_ID, status: "completed", updatedAt: "2026-09-27T22:17:17.065Z" };
    fakeProjectLocations = { localWorkingDirectory: "/tmp/os-workspace" };
    // Local start now skips missing cwd candidates (BDV-64); keep the fixture on disk.
    fs.mkdirSync("/tmp/os-workspace", { recursive: true });
    getThreadShellCalls = [];
    threadState = {
      status: "completed",
      lastError: null,
      activeRunId: null,
      latestRunRequestedAt: "2026-09-27T22:10:01.709Z",
      latestUserMessageAt: "2026-09-27T22:10:01.709Z",
      settledAt: null,
    };
    fetchCalls = [];
    dispatched = [];
    resetControlPendingDispatches();
    resetControlSessionPromoteStateForTests();
    process.env.BACKSTEROS_API_KEY = API_KEY;
    process.env.BACKSTEROS_API_URL = API_ORIGIN;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = (init?.method ?? "GET").toUpperCase();
        let patchStatus: string | undefined;
        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
          patchStatus = body.status;
        }
        fetchCalls.push({ method, url, ...(patchStatus ? { patchStatus } : {}) });
        if (url === `${API_ORIGIN}/api/v1/projects?type=codebase`) {
          return new Response(
            JSON.stringify({
              projects: [
                {
                  id: "os-project",
                  key: "OS",
                  name: "OS",
                  ...fakeProjectLocations,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url === `${API_ORIGIN}/api/v1/projects/os-project`) {
          return new Response(
            JSON.stringify({
              id: "os-project",
              key: "OS",
              name: "OS",
              ...fakeProjectLocations,
            }),
            { status: 200 },
          );
        }
        if (url === `${API_ORIGIN}/api/v1/tasks/${TASK_ID}`) {
          if (method === "PATCH") {
            const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
            if (body.status) fakeTask.status = body.status;
            fakeTask.updatedAt = "2099-01-01T00:00:00.000Z";
          }
          return new Response(
            JSON.stringify({
              ...fakeTask,
              number: 38,
              title: "test",
              projectId: "os-project",
              description: "desc",
              executionLocation: fakeTask.executionLocation ?? null,
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetControlPendingDispatches();
    resetControlSessionPromoteStateForTests();
    if (savedEnv.key === undefined) delete process.env.BACKSTEROS_API_KEY;
    else process.env.BACKSTEROS_API_KEY = savedEnv.key;
    if (savedEnv.url === undefined) delete process.env.BACKSTEROS_API_URL;
    else process.env.BACKSTEROS_API_URL = savedEnv.url;
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  describe("control status GET is read-only", () => {
    it("never changes task status or updatedAt, for any session state", async () => {
      const before = { ...fakeTask };
      const states: Array<Partial<ThreadState>> = [
        {}, // finished run → idle
        { settledAt: "2026-09-27T22:10:11.000Z", status: "interrupted" }, // done
        { status: "running", activeRunId: "run-1" }, // working
        { status: "failed" }, // blocked
      ];
      for (const taskStatus of ["completed", "in_progress", "ready_to_start"]) {
        fakeTask = { ...before, status: taskStatus };
        for (const state of states) {
          Object.assign(threadState, state);
          for (let poll = 0; poll < 3; poll += 1) {
            await getStatus();
            await getStatus("taskRef=OS-38");
            await getStatus(`taskId=${TASK_ID}`);
          }
          await flush();
          expect(fakeTask).toEqual({ ...before, status: taskStatus });
        }
      }
      // The old handler PATCHed In Review on `done`; now no BacksterOS call at all.
      expect(fetchCalls).toEqual([]);
    });
  });

  describe("control status mapping over a turn", () => {
    it("GET after a finished run returns idle", async () => {
      const view = await getStatus();
      expect(view).toMatchObject({ status: "idle", sessionStatus: "completed", lastError: null });
    });

    it("surfaces lastError when the run failed", async () => {
      threadState.status = "failed";
      threadState.lastError =
        "Thread '11111111-2222-4333-8444-555555555555' is bound to driver 'cursor' and cannot switch to 'claudeAgent'.";
      const view = await getStatus();
      expect(view).toMatchObject({
        status: "blocked",
        sessionStatus: "failed",
        lastError: threadState.lastError,
      });
    });

    it("send to a stopped session reads working until the run ends", async () => {
      // Previous run finished and the thread auto-settled.
      threadState.status = "interrupted";
      threadState.settledAt = "2026-09-27T22:10:11.000Z";
      expect((await getStatus()).status).toBe("done");

      const sent = await sendMessage("Reply with the single word ok.");
      expect(sent).toMatchObject({ sent: true, status: "working", sessionStatus: "interrupted" });
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toMatchObject({
        type: "message.dispatch",
        createdBy: "user",
        creationSource: "server",
        text: "Reply with the single word ok.",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
      });

      // Right after the send: projection has the message, run not requested yet.
      const sentAt = new Date().toISOString();
      threadState.latestUserMessageAt = sentAt;
      threadState.settledAt = null;
      expect((await getStatus()).status).toBe("working");
      threadState.status = "starting";
      expect((await getStatus()).status).toBe("working");

      // Run starts (requestedAt >= dispatch time), then finishes.
      threadState.status = "running";
      threadState.activeRunId = "run-2";
      threadState.latestRunRequestedAt = sentAt;
      expect((await getStatus()).status).toBe("working");

      threadState.status = "completed";
      threadState.activeRunId = null;
      expect((await getStatus()).status).toBe("idle");

      // Auto-settle at run end → done; GETs still never write BacksterOS status.
      // POST /message may GET the live task for an explicit promote attempt, but
      // completed tasks stay closed (no PATCH).
      threadState.status = "interrupted";
      threadState.settledAt = sentAt;
      expect((await getStatus()).status).toBe("done");
      await flush();
      expect(fetchCalls.every((call) => call.method === "GET")).toBe(true);
      expect(fetchCalls.some((call) => call.method === "PATCH")).toBe(false);
      expect(fakeTask.status).toBe("completed");
    });
  });

  describe("POST /sessions continue thread driver (OS-91)", () => {
    const WORKSPACE = "/tmp/os-workspace";

    function t3Project() {
      return {
        id: "t3-project",
        title: "OS",
        workspaceRoot: WORKSPACE,
        defaultModelSelection: { instanceId: "claudeAgent", model: "opus" },
        scripts: [] as const,
        createdAt: "2026-09-27T22:00:00.000Z",
        updatedAt: "2026-09-27T22:00:00.000Z",
      };
    }

    function runStart(
      body: Record<string, unknown>,
      options?: { readonly failDispatch?: boolean },
    ): Promise<Response> {
      const provided = provideControlServices(
        controlStartHandler,
        new Request("http://127.0.0.1:3773/api/backsteros/control/sessions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        {
          projects: [t3Project()],
          dispatch: (command) =>
            options?.failDispatch === true && command.type === "message.dispatch"
              ? Effect.fail(new Error("dispatch failed"))
              : Effect.succeed({ sequence: dispatched.length }),
        },
      );
      return Effect.runPromise(provided).then((response) => HttpServerResponse.toWeb(response));
    }

    it("continues a cursor thread with cursor even when the project default is claudeAgent", async () => {
      fakeTask.status = "in_progress";
      const response = await runStart({
        taskId: TASK_ID,
        start: true,
        prompt: "Follow-up: stay on cursor.",
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { started: boolean; created: boolean };
      expect(body).toMatchObject({ started: true, created: false });
      const turn = dispatched.find((command) => command.type === "message.dispatch");
      expect(turn?.modelSelection).toEqual({ instanceId: "cursor", model: "default" });
      expect(turn?.dispatchMode).toEqual({ type: "start_immediately" });
    });

    it("returns 409 driver_mismatch when the caller asks for another driver", async () => {
      fakeTask.status = "in_progress";
      const response = await runStart({
        taskId: TASK_ID,
        start: true,
        prompt: "Wrong driver",
        modelSelection: { instanceId: "claudeAgent", model: "opus" },
      });
      expect(response.status).toBe(409);
      const body = (await response.json()) as {
        ok: boolean;
        code: string;
        error: string;
        threadInstanceId: string;
        threadDriver: string;
        requestedInstanceId: string;
        requestedDriver: string;
      };
      expect(body).toMatchObject({
        ok: false,
        code: "driver_mismatch",
        threadInstanceId: "cursor",
        threadDriver: "cursor",
        requestedInstanceId: "claudeAgent",
        requestedDriver: "claudeAgent",
      });
      expect(body.error).toContain("driver 'cursor'");
      expect(body.error).toContain("claudeAgent");
      expect(dispatched).toEqual([]);
      await flush();
      expect(fakeTask.status).toBe("in_progress");
      expect(fetchCalls.some((call) => call.method === "PATCH")).toBe(false);
    });

    it("retry of an errored thread still marks the task in_progress", async () => {
      fakeTask.status = "in_review";
      threadState.status = "failed";
      threadState.lastError =
        "Thread '11111111-2222-4333-8444-555555555555' is bound to driver 'cursor' and cannot switch to 'claudeAgent'.";
      const response = await runStart({
        taskId: TASK_ID,
        start: true,
        prompt: "Retry after a rejected turn",
        modelSelection: { instanceId: "cursor", model: "default" },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        lastError: string | null;
        sessionStatus: string | null;
        started: boolean;
      };
      expect(body.started).toBe(true);
      expect(body.sessionStatus).toBe("failed");
      expect(body.lastError).toBe(threadState.lastError);
      expect(dispatched.some((command) => command.type === "message.dispatch")).toBe(true);
      await flush();
      expect(fakeTask.status).toBe("in_progress");
      expect(
        fetchCalls.some((call) => call.method === "PATCH" && call.patchStatus === "in_progress"),
      ).toBe(true);
      expect(fetchCalls.some((call) => call.patchStatus === "in_review")).toBe(false);
    });

    it("skips a missing developmentLocation and kicks off in the Mac folder (BDV-64)", async () => {
      const macFolder = fs.mkdtempSync(path.join(os.tmpdir(), "bdv64-mac-"));
      try {
        removeBacksterosTaskThreadBinding(stateDir, TASK_ID);
        fakeTask.status = "ready_to_start";
        fakeTask.executionLocation = "development";
        fakeProjectLocations = {
          localWorkingDirectory: macFolder,
          developmentLocation: "/home/deploy/server-only-bdv64-does-not-exist",
        };
        const createdProjects: string[] = [];
        const response = await Effect.runPromise(
          provideControlServices(
            controlStartHandler,
            new Request("http://127.0.0.1:3773/api/backsteros/control/sessions", {
              method: "POST",
              headers: {
                authorization: `Bearer ${API_KEY}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                taskId: TASK_ID,
                start: true,
                // Force local even though the task is locked to development.
                environmentId: "env-1",
                environmentLabel: "local",
              }),
            }),
            {
              projects: [],
              createProject: (input) => {
                createdProjects.push(input.workspaceRoot);
                return Effect.succeed({
                  id: input.projectId,
                  title: input.title,
                  workspaceRoot: input.workspaceRoot,
                  defaultModelSelection: { instanceId: "claudeAgent", model: "opus" },
                  scripts: [],
                  createdAt: "2026-09-27T22:00:00.000Z",
                  updatedAt: "2026-09-27T22:00:00.000Z",
                });
              },
            },
          ),
        ).then((res) => HttpServerResponse.toWeb(res));

        expect(response.status).toBe(200);
        const body = (await response.json()) as { started: boolean; created: boolean };
        expect(body).toMatchObject({ started: true, created: true });
        expect(createdProjects).toEqual([macFolder]);
        const turn = dispatched.find((command) => command.type === "message.dispatch");
        expect(turn?.text).toContain(`Working directory: ${macFolder}`);
        expect(turn?.text).not.toContain("server-only-bdv64-does-not-exist");
      } finally {
        fs.rmSync(macFolder, { recursive: true, force: true });
      }
    });

    it("a new thread uses the project default model", async () => {
      removeBacksterosTaskThreadBinding(stateDir, TASK_ID);
      fakeTask.status = "ready_to_start";
      const response = await runStart({
        taskId: TASK_ID,
        start: true,
        prompt: "Kickoff on the project default.",
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { created: boolean; started: boolean };
      expect(body).toMatchObject({ created: true, started: true });
      const create = dispatched.find((command) => command.type === "thread.create");
      const turn = dispatched.find((command) => command.type === "message.dispatch");
      expect(create).toMatchObject({ createdBy: "user", creationSource: "server" });
      expect(create?.modelSelection).toEqual({ instanceId: "claudeAgent", model: "opus" });
      expect(turn?.modelSelection).toEqual({ instanceId: "claudeAgent", model: "opus" });
      expect(turn).toMatchObject({
        createdBy: "user",
        creationSource: "server",
        dispatchMode: { type: "start_immediately" },
        attachments: [],
      });
      expect(turn?.titleSeed).toContain("OS-38");
    });

    it("returns after dispatch without re-reading the thread shell (BDV-64)", async () => {
      removeBacksterosTaskThreadBinding(stateDir, TASK_ID);
      fakeTask.status = "ready_to_start";
      getThreadShellCalls = [];
      const response = await runStart({
        taskId: TASK_ID,
        start: true,
        prompt: "Return before provider readiness.",
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        created: boolean;
        started: boolean;
        status: string;
        threadId: string;
        sessionStatus: string | null;
      };
      expect(body).toMatchObject({
        created: true,
        started: true,
        status: "working",
        sessionStatus: null,
      });
      expect(body.threadId).toBeTruthy();
      // New thread: no pre-dispatch shell lookup, and none after dispatch.
      expect(getThreadShellCalls).toEqual([]);
      expect(getControlPendingDispatch(body.threadId)).not.toBeNull();
      expect(dispatched.map((command) => command.type)).toEqual([
        "thread.create",
        "message.dispatch",
      ]);
    });

    it("kicks Cursor ACP warm-up at start arrival (BDV-64)", async () => {
      const kickSpy = vi
        .spyOn(CursorAcpWarm, "kickCursorAcpWarmPool")
        .mockImplementation(() => undefined);
      try {
        fakeTask.status = "in_progress";
        const response = await runStart({
          taskId: TASK_ID,
          start: true,
          prompt: "Warm kick.",
        });
        expect(response.status).toBe(200);
        expect(kickSpy).toHaveBeenCalledTimes(1);
      } finally {
        kickSpy.mockRestore();
      }
    });

    function runPromote(): Promise<Response> {
      const provided = provideControlServices(
        controlPromoteHandler,
        new Request("http://127.0.0.1:3773/api/backsteros/control/sessions/promote", {
          method: "POST",
          headers: {
            authorization: `Bearer ${API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ taskId: TASK_ID }),
        }),
        { projects: [t3Project()] },
      );
      return Effect.runPromise(provided).then((response) => HttpServerResponse.toWeb(response));
    }

    it("a dispatch failure does not write in_progress", async () => {
      fakeTask.status = "ready_to_start";
      const response = await runStart(
        {
          taskId: TASK_ID,
          start: true,
          prompt: "This dispatch will fail.",
        },
        { failDispatch: true },
      );
      expect(response.status).toBe(500);
      await flush();
      expect(fakeTask.status).toBe("ready_to_start");
      expect(fetchCalls.some((call) => call.method === "PATCH")).toBe(false);
    });

    it("POST /sessions/promote does not flip in_review for stopped+lastError", async () => {
      fakeTask.status = "in_progress";
      threadState.status = "running";
      threadState.activeRunId = "run-1";
      expect((await runPromote()).status).toBe(200);
      await flush();
      expect(fakeTask.status).toBe("in_progress");

      // failed maps to blocked → in_progress, not the in_review guard.
      threadState.status = "failed";
      threadState.activeRunId = null;
      threadState.lastError = "bound to driver 'cursor' and cannot switch to 'claudeAgent'";
      fetchCalls.length = 0;
      expect((await runPromote()).status).toBe(200);
      await flush();
      expect(fakeTask.status).toBe("in_progress");
      expect(fetchCalls.some((call) => call.patchStatus === "in_review")).toBe(false);

      // settled stopped+lastError maps to done; that is the in_review guard.
      threadState.status = "interrupted";
      threadState.settledAt = "2026-09-27T22:10:11.000Z";
      fetchCalls.length = 0;
      expect((await runPromote()).status).toBe(200);
      await flush();
      expect(fakeTask.status).toBe("in_progress");
      expect(fetchCalls.some((call) => call.patchStatus === "in_review")).toBe(false);
    });

    it("POST /message then promote does not flip in_review for stopped+lastError", async () => {
      fakeTask.status = "in_progress";
      threadState.status = "interrupted";
      threadState.lastError = "bound to driver 'cursor' and cannot switch to 'claudeAgent'";
      threadState.settledAt = "2026-09-27T22:10:11.000Z";
      const sent = await sendMessage("Retry on the bound driver.");
      expect(sent.sent).toBe(true);
      expect(sent.status).toBe("working");
      await flush();
      expect(fakeTask.status).toBe("in_progress");

      // After dispatch the view is working (pending). Drop pending so the
      // next promote sees settled stopped+lastError as done and hits the guard.
      resetControlPendingDispatches();
      fetchCalls.length = 0;
      expect((await runPromote()).status).toBe(200);
      await flush();
      expect(fakeTask.status).toBe("in_progress");
      expect(fetchCalls.some((call) => call.patchStatus === "in_review")).toBe(false);
    });
  });

  describe("POST /sessions/prune", () => {
    const ORPHAN_TASK = "orphan-task-id";
    const ORPHAN_THREAD = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

    function runPrune(threads: ReturnType<typeof threadShell>[]) {
      const provided = provideControlServices(
        controlPruneHandler,
        new Request("http://127.0.0.1:3773/api/backsteros/control/sessions/prune", {
          method: "POST",
          headers: {
            authorization: `Bearer ${API_KEY}`,
            "content-type": "application/json",
          },
          body: "{}",
        }),
        { threads },
      );
      return Effect.runPromise(provided).then((response) => HttpServerResponse.toWeb(response));
    }

    it("removes bindings whose threads are gone and keeps live bindings", async () => {
      writeBacksterosTaskThreadBinding(stateDir, ORPHAN_TASK, {
        threadId: ORPHAN_THREAD,
        environmentId: "env-1",
        t3ProjectId: "t3-project",
        backsterosProjectId: "os-project",
        projectTitle: "OS",
        title: "orphan",
        displayId: "OS-999",
      });
      expect(listBacksterosTaskThreadBindings(stateDir)).toHaveLength(2);

      // Live THREAD_ID still in the shell snapshot; orphan thread is absent.
      const response = await runPrune([threadShell()]);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; pruned: string[] };
      expect(body).toEqual({ ok: true, pruned: [ORPHAN_TASK] });
      expect(findBacksterosTaskThreadBinding(stateDir, { taskId: TASK_ID })?.taskId).toBe(TASK_ID);
      expect(findBacksterosTaskThreadBinding(stateDir, { taskId: ORPHAN_TASK })).toBeNull();
    });

    it("does not remove a binding when its thread shell is still present", async () => {
      const before = listBacksterosTaskThreadBindings(stateDir)
        .map((row) => row.taskId)
        .sort();
      const response = await runPrune([threadShell()]);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; pruned: string[] };
      expect(body.pruned).toEqual([]);
      expect(
        listBacksterosTaskThreadBindings(stateDir)
          .map((row) => row.taskId)
          .sort(),
      ).toEqual(before);
      // Guard: helper still available for explicit cleanup in other tests.
      expect(typeof removeBacksterosTaskThreadBinding).toBe("function");
    });
  });
});
