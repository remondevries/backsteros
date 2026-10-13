import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { collectBacksterosWorkingTaskIds } from "./taskChatWorking";
import type { BacksterosTaskChatBinding } from "./taskChatStore";

function shell(partial: {
  readonly id: string;
  readonly environmentId: string;
  readonly sessionStatus?: "running" | "starting" | "stopped" | "error" | null;
  readonly backgroundLiveness?: "working" | "monitoring" | null;
  readonly hasPendingApprovals?: boolean;
  readonly hasPendingUserInput?: boolean;
}): EnvironmentThreadShell {
  return {
    id: ThreadId.make(partial.id),
    environmentId: EnvironmentId.make(partial.environmentId),
    hasPendingApprovals: partial.hasPendingApprovals ?? false,
    hasPendingUserInput: partial.hasPendingUserInput ?? false,
    backgroundLiveness: partial.backgroundLiveness ?? null,
    session:
      partial.sessionStatus == null
        ? null
        : ({
            status: partial.sessionStatus,
          } as EnvironmentThreadShell["session"]),
  } as EnvironmentThreadShell;
}

const binding = (partial: {
  readonly threadId: string;
  readonly environmentId: string;
}): BacksterosTaskChatBinding => ({
  kind: "thread",
  threadId: partial.threadId,
  environmentId: partial.environmentId,
  t3ProjectId: "t3-project",
  backsterosProjectId: "bos-project",
  projectTitle: "Project",
  title: "Task",
  displayId: null,
});

describe("collectBacksterosWorkingTaskIds", () => {
  it("marks tasks whose bound chat is working", () => {
    const working = collectBacksterosWorkingTaskIds({
      byTaskId: {
        "task-a": binding({ threadId: "thread-a", environmentId: "env-1" }),
        "task-b": binding({ threadId: "thread-b", environmentId: "env-1" }),
      },
      shells: [
        shell({ id: "thread-a", environmentId: "env-1", sessionStatus: "running" }),
        shell({ id: "thread-b", environmentId: "env-1", sessionStatus: "stopped" }),
      ],
    });

    expect([...working]).toEqual(["task-a"]);
  });

  it("treats background fleet work as working", () => {
    const working = collectBacksterosWorkingTaskIds({
      byTaskId: {
        "task-a": binding({ threadId: "thread-a", environmentId: "env-1" }),
      },
      shells: [
        shell({
          id: "thread-a",
          environmentId: "env-1",
          sessionStatus: "stopped",
          backgroundLiveness: "working",
        }),
      ],
    });

    expect(working.has("task-a")).toBe(true);
  });

  it("does not mark approval or input waits as working", () => {
    const working = collectBacksterosWorkingTaskIds({
      byTaskId: {
        "task-a": binding({ threadId: "thread-a", environmentId: "env-1" }),
        "task-b": binding({ threadId: "thread-b", environmentId: "env-1" }),
      },
      shells: [
        shell({
          id: "thread-a",
          environmentId: "env-1",
          sessionStatus: "running",
          hasPendingApprovals: true,
        }),
        shell({
          id: "thread-b",
          environmentId: "env-1",
          sessionStatus: "running",
          hasPendingUserInput: true,
        }),
      ],
    });

    expect(working.size).toBe(0);
  });

  it("ignores bindings with no matching shell", () => {
    const working = collectBacksterosWorkingTaskIds({
      byTaskId: {
        "task-a": binding({ threadId: "missing", environmentId: "env-1" }),
      },
      shells: [],
    });

    expect(working.size).toBe(0);
  });
});
