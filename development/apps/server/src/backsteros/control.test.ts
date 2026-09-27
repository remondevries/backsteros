import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerConfig from "../config.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import {
  controlMessageHandler,
  controlStatusHandler,
  isControlDispatchPending,
  isControlLoopbackRemote,
  mapSessionStatus,
  matchControlT3Project,
  resolveControlSessionStatus,
  resolveControlWorkspaceRoot,
} from "./control.ts";
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
  const turn = (state: "running" | "completed" | "interrupted" | "error") =>
    ({
      turnId: "turn-1",
      state,
      requestedAt: "2026-09-27T22:10:01.709Z",
      startedAt: "2026-09-27T22:10:01.709Z",
      completedAt: state === "running" ? null : "2026-09-27T22:10:10.071Z",
      assistantMessageId: null,
    }) as StatusInput["latestTurn"];
  const thread = (overrides: Partial<StatusInput> = {}): StatusInput => ({
    settledOverride: null,
    settledAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    backgroundLiveness: null,
    latestTurn: turn("completed"),
    latestUserMessageAt: "2026-09-27T22:10:01.709Z",
    session: { status: "ready", activeTurnId: null },
    ...overrides,
  });

  it("reports idle once a turn has finished and the session is ready", () => {
    expect(mapSessionStatus(thread())).toBe("idle");
  });

  it("reports working while a turn is active", () => {
    expect(
      mapSessionStatus(thread({ session: { status: "running", activeTurnId: "turn-1" as never } })),
    ).toBe("working");
    expect(
      mapSessionStatus(thread({ session: { status: "ready", activeTurnId: "turn-1" as never } })),
    ).toBe("working");
    expect(mapSessionStatus(thread({ latestTurn: turn("running") }))).toBe("working");
  });

  it("reports working when a sent message has not started its turn yet", () => {
    expect(mapSessionStatus(thread({ latestUserMessageAt: "2026-09-27T22:11:00.000Z" }))).toBe(
      "working",
    );
    expect(mapSessionStatus(thread({ latestTurn: null }))).toBe("working");
  });

  it("keeps background work, blocked and settled mappings", () => {
    expect(mapSessionStatus(thread({ backgroundLiveness: "monitoring" }))).toBe("working");
    expect(mapSessionStatus(thread({ hasPendingApprovals: true }))).toBe("blocked");
    expect(mapSessionStatus(thread({ session: { status: "error", activeTurnId: null } }))).toBe(
      "blocked",
    );
    expect(mapSessionStatus(thread({ settledAt: "2026-09-27T22:12:00.000Z" }))).toBe("done");
    expect(
      mapSessionStatus(thread({ session: null, latestTurn: null, latestUserMessageAt: null })),
    ).toBe("idle");
    expect(mapSessionStatus(null)).toBe("idle");
  });

  describe("pending control dispatch (send to a stopped session)", () => {
    // Previous turn finished and the thread auto-settled; session stopped.
    const stoppedSettled = (overrides: Partial<StatusInput> = {}) =>
      thread({
        session: { status: "stopped", activeTurnId: null },
        settledAt: "2026-09-27T22:10:10.500Z",
        ...overrides,
      });
    const dispatchedAt = Date.parse("2026-09-27T22:29:12.000Z");

    it("reads idle/done without a pending dispatch (the pre-fix gap)", () => {
      expect(mapSessionStatus(stoppedSettled({ settledAt: null }))).toBe("idle");
      expect(mapSessionStatus(stoppedSettled())).toBe("done");
    });

    it("reads working right after a send until the turn starts", () => {
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
      // Projection has the user message but the session has not started yet.
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

    it("stops counting once a turn requested at/after the dispatch exists", () => {
      const newTurn = (state: "running" | "completed") =>
        ({
          ...turn(state),
          turnId: "turn-2",
          requestedAt: "2026-09-27T22:29:12.004Z",
        }) as StatusInput["latestTurn"];
      const now = dispatchedAt + 5_000;
      expect(
        isControlDispatchPending(
          stoppedSettled({ latestTurn: newTurn("running") }),
          dispatchedAt,
          now,
        ),
      ).toBe(false);
      // Turn running → working via the session/turn itself.
      expect(
        mapSessionStatus(
          thread({
            latestTurn: newTurn("running"),
            session: { status: "running", activeTurnId: "turn-2" as never },
          }),
          { pendingDispatchAt: dispatchedAt, now },
        ),
      ).toBe("working");
      // Finished turn → idle (ready) or done once settled, even with a stale pending record.
      expect(
        mapSessionStatus(thread({ latestTurn: newTurn("completed") }), {
          pendingDispatchAt: dispatchedAt,
          now,
        }),
      ).toBe("idle");
      expect(
        mapSessionStatus(
          stoppedSettled({
            latestTurn: newTurn("completed"),
            settledAt: "2026-09-27T22:29:20.000Z",
          }),
          { pendingDispatchAt: dispatchedAt, now },
        ),
      ).toBe("done");
    });

    it("gives way to blocked on session error and expires after the timeout", () => {
      expect(
        mapSessionStatus(stoppedSettled({ session: { status: "error", activeTurnId: null } }), {
          pendingDispatchAt: dispatchedAt,
          now: dispatchedAt + 1_000,
        }),
      ).toBe("blocked");
      expect(
        mapSessionStatus(stoppedSettled({ hasPendingApprovals: true }), {
          pendingDispatchAt: dispatchedAt,
          now: dispatchedAt + 1_000,
        }),
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
          latestTurn: {
            ...turn("completed"),
            requestedAt: "2026-09-27T22:29:12.010Z",
          } as StatusInput["latestTurn"],
          settledAt: null,
          session: { status: "ready", activeTurnId: null },
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

  type FakeTask = { id: string; status: string; updatedAt: string };

  type ThreadState = {
    sessionStatus: string | null;
    activeTurnId: string | null;
    latestTurn: {
      turnId: string;
      state: "running" | "completed" | "interrupted" | "error";
      requestedAt: string;
      startedAt: string | null;
      completedAt: string | null;
      assistantMessageId: null;
    } | null;
    latestUserMessageAt: string | null;
    settledAt: string | null;
  };

  let stateDir: string;
  let idCounter = 0;
  let fakeTask: FakeTask;
  let threadState: ThreadState;
  let fetchCalls: Array<{ method: string; url: string }>;
  let dispatched: Array<{ type: string; createdAt?: string }>;
  const savedEnv = {
    key: process.env.BACKSTEROS_API_KEY,
    url: process.env.BACKSTEROS_API_URL,
  };

  function threadShell() {
    return {
      id: THREAD_ID,
      projectId: "t3-project",
      title: "OS-38 · test",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      settledOverride: null,
      settledAt: threadState.settledAt,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      backgroundLiveness: null,
      latestTurn: threadState.latestTurn,
      latestUserMessageAt: threadState.latestUserMessageAt,
      session:
        threadState.sessionStatus === null
          ? null
          : { status: threadState.sessionStatus, activeTurnId: threadState.activeTurnId },
    };
  }

  function runHandler(
    handler: typeof controlStatusHandler | typeof controlMessageHandler,
    request: Request,
  ): Promise<Response> {
    const provided = (handler as typeof controlMessageHandler).pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(request),
      ),
      Effect.provideService(SessionStore.SessionStore, {} as never),
      Effect.provideService(EnvironmentAuth.EnvironmentAuth, {} as never),
      Effect.provideService(ServerConfig.ServerConfig, {
        stateDir,
        attachmentsDir: path.join(stateDir, "attachments"),
      } as never),
      Effect.provideService(ProjectionSnapshotQuery, {
        getShellSnapshot: () => Effect.sync(() => ({ projects: [], threads: [threadShell()] })),
      } as never),
      Effect.provideService(OrchestrationEngineService, {
        dispatch: (command: { type: string; createdAt?: string }) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      } as never),
      Effect.provideService(Crypto.Crypto, {
        randomUUIDv4: Effect.sync(
          () => `00000000-0000-4000-8000-${String((idCounter += 1)).padStart(12, "0")}`,
        ),
      } as never),
      Effect.provideService(FileSystem.FileSystem, {} as never),
      Effect.provideService(Path.Path, {} as never),
      Effect.provideService(WorkspacePaths.WorkspacePaths, {} as never),
    );
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
    return (await response.json()) as { status: string; sessionStatus: string | null };
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
    threadState = {
      sessionStatus: "ready",
      activeTurnId: null,
      latestTurn: {
        turnId: "turn-1",
        state: "completed",
        requestedAt: "2026-09-27T22:10:01.709Z",
        startedAt: "2026-09-27T22:10:01.709Z",
        completedAt: "2026-09-27T22:10:10.071Z",
        assistantMessageId: null,
      },
      latestUserMessageAt: "2026-09-27T22:10:01.709Z",
      settledAt: null,
    };
    fetchCalls = [];
    dispatched = [];
    resetControlPendingDispatches();
    process.env.BACKSTEROS_API_KEY = API_KEY;
    process.env.BACKSTEROS_API_URL = API_ORIGIN;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = (init?.method ?? "GET").toUpperCase();
        fetchCalls.push({ method, url });
        if (url === `${API_ORIGIN}/api/v1/tasks/${TASK_ID}`) {
          if (method === "PATCH") {
            const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
            if (body.status) fakeTask.status = body.status;
            fakeTask.updatedAt = "2099-01-01T00:00:00.000Z";
          }
          return new Response(JSON.stringify(fakeTask), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetControlPendingDispatches();
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
        {}, // finished turn, ready → idle
        { settledAt: "2026-09-27T22:10:11.000Z", sessionStatus: "stopped" }, // done
        { sessionStatus: "running", activeTurnId: "turn-1" }, // working
        { sessionStatus: "error" }, // blocked
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
    it("GET after a finished turn returns idle", async () => {
      const view = await getStatus();
      expect(view).toMatchObject({ status: "idle", sessionStatus: "ready" });
    });

    it("send to a stopped session reads working until the turn ends", async () => {
      // Previous turn finished and the thread auto-settled; session stopped.
      threadState.sessionStatus = "stopped";
      threadState.settledAt = "2026-09-27T22:10:11.000Z";
      expect((await getStatus()).status).toBe("done");

      const sent = await sendMessage("Reply with the single word ok.");
      expect(sent).toMatchObject({ sent: true, status: "working", sessionStatus: "stopped" });
      expect(dispatched).toHaveLength(1);

      // Right after the send: projection has the message (stamped with the
      // command time), provider session not started yet.
      const sentAt = dispatched[0]!.createdAt!;
      threadState.latestUserMessageAt = sentAt;
      threadState.settledAt = null;
      expect((await getStatus()).status).toBe("working");
      threadState.sessionStatus = "starting";
      expect((await getStatus()).status).toBe("working");

      // Turn starts (requestedAt = dispatched command time), then finishes.
      const requestedAt = sentAt;
      threadState.sessionStatus = "running";
      threadState.activeTurnId = "turn-2";
      threadState.latestTurn = {
        turnId: "turn-2",
        state: "running",
        requestedAt,
        startedAt: requestedAt,
        completedAt: null,
        assistantMessageId: null,
      };
      expect((await getStatus()).status).toBe("working");

      threadState.sessionStatus = "ready";
      threadState.activeTurnId = null;
      threadState.latestTurn = {
        ...threadState.latestTurn,
        state: "completed",
        completedAt: sentAt,
      };
      expect((await getStatus()).status).toBe("idle");

      // Auto-settle at turn end → done; still no BacksterOS writes from GETs.
      threadState.sessionStatus = "stopped";
      threadState.settledAt = sentAt;
      expect((await getStatus()).status).toBe("done");
      await flush();
      expect(fetchCalls).toEqual([]);
      expect(fakeTask.status).toBe("completed");
    });
  });
});
