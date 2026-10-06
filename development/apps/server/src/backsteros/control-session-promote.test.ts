import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS,
  cancelControlSessionIdlePromote,
  maybePromoteBacksterosTaskForControlSession,
  resetControlSessionPromoteStateForTests,
  scheduleControlSessionPromoteAfterTurn,
} from "./control-session-promote.ts";
import { writeBacksterosTaskThreadBinding } from "./task-thread-bindings.ts";

const patchCalls: Array<{ taskId: string; status: string }> = [];

vi.mock("./control-backsteros.ts", () => ({
  patchBacksterosControlTaskStatus: (taskId: string, status: string) => {
    patchCalls.push({ taskId, status });
    return Promise.resolve(true);
  },
}));

describe("control-session-promote (OS-73 idle in_review)", () => {
  let stateDir: string;
  const TASK_ID = "task-promote-1";
  const THREAD_ID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    resetControlSessionPromoteStateForTests();
    patchCalls.length = 0;
    vi.useFakeTimers();
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "control-promote-"));
    writeBacksterosTaskThreadBinding(stateDir, TASK_ID, {
      threadId: THREAD_ID,
      environmentId: "env-1",
      t3ProjectId: "t3-project",
      backsterosProjectId: "os-project",
      projectTitle: "OS",
      title: "Promote me",
      displayId: "OS-73",
    });
  });

  afterEach(() => {
    resetControlSessionPromoteStateForTests();
    vi.useRealTimers();
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  it("promotes to in_review after a successful turn once the grace elapses", () => {
    scheduleControlSessionPromoteAfterTurn(stateDir, THREAD_ID);
    expect(patchCalls).toEqual([]);
    vi.advanceTimersByTime(CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS);
    expect(patchCalls).toEqual([{ taskId: TASK_ID, status: "in_review" }]);
  });

  it("cancels promotion when a new message / activity arrives within 5s", () => {
    scheduleControlSessionPromoteAfterTurn(stateDir, THREAD_ID);
    vi.advanceTimersByTime(CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS - 1);
    cancelControlSessionIdlePromote(stateDir, THREAD_ID);
    // Message path marks working (may no-op PATCH if already working from schedule).
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "working");
    vi.advanceTimersByTime(CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS + 1);
    expect(patchCalls.every((call) => call.status !== "in_review")).toBe(true);
  });

  it("does not promote after a failed or interrupted turn (never scheduled)", () => {
    // Callers skip schedule for failed/interrupted; cancel is still safe.
    cancelControlSessionIdlePromote(stateDir, THREAD_ID);
    vi.advanceTimersByTime(CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS + 1);
    expect(patchCalls).toEqual([]);
  });

  it("does not promote idle-after-working when the session errored", () => {
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "working");
    patchCalls.length = 0;
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "idle", {
      sessionStatus: "error",
      lastError: "Thread is bound to driver 'cursor' and cannot switch to 'claudeAgent'.",
    });
    expect(patchCalls.every((call) => call.status !== "in_review")).toBe(true);
  });

  it("does not promote idle/done when the session stopped with lastError", () => {
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "working");
    patchCalls.length = 0;
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "idle", {
      sessionStatus: "stopped",
      lastError: "Thread is bound to driver 'cursor' and cannot switch to 'claudeAgent'.",
    });
    expect(patchCalls).toEqual([]);
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "done", {
      sessionStatus: "stopped",
      lastError: "Thread is bound to driver 'cursor' and cannot switch to 'claudeAgent'.",
    });
    expect(patchCalls.every((call) => call.status !== "in_review")).toBe(true);
  });

  it("still promotes idle-after-working for a healthy ready session", () => {
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "working");
    patchCalls.length = 0;
    maybePromoteBacksterosTaskForControlSession(TASK_ID, "idle", {
      sessionStatus: "ready",
      lastError: null,
    });
    expect(patchCalls).toEqual([{ taskId: TASK_ID, status: "in_review" }]);
  });

  it("skips promote when isIdle returns false at fire time", () => {
    scheduleControlSessionPromoteAfterTurn(stateDir, THREAD_ID, {
      isIdle: () => false,
    });
    vi.advanceTimersByTime(CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS);
    expect(patchCalls).toEqual([]);
  });

  it("no-ops for unbound (pure web) threads without a task binding", () => {
    scheduleControlSessionPromoteAfterTurn(stateDir, "00000000-0000-4000-8000-000000000099");
    vi.advanceTimersByTime(CONTROL_SESSION_IDLE_PROMOTE_GRACE_MS);
    expect(patchCalls).toEqual([]);
  });
});
