import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  markBacksterosTaskInProgressForAgent,
  markBacksterosTaskInReviewForAgent,
  shouldMarkBacksterosTaskInReviewAfterWorking,
} from "./promoteWorkingTask";

vi.mock("./client", () => ({
  fetchBacksterosTask: vi.fn(),
  updateBacksterosTask: vi.fn(),
}));

import { fetchBacksterosTask, updateBacksterosTask } from "./client";

const fetchMock = vi.mocked(fetchBacksterosTask);
const updateMock = vi.mocked(updateBacksterosTask);

afterEach(() => {
  vi.clearAllMocks();
});

describe("markBacksterosTaskInProgressForAgent", () => {
  it("patches tasks to in_progress without a preliminary GET", async () => {
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_progress",
      activityActor: "agent",
    });
  });
});

describe("markBacksterosTaskInReviewForAgent", () => {
  it("patches tasks to in_review without a preliminary GET", async () => {
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_review",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInReviewForAgent("task-1")).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_review",
      activityActor: "agent",
    });
  });
});

describe("shouldMarkBacksterosTaskInReviewAfterWorking", () => {
  const binding = {
    kind: "thread" as const,
    threadId: "thread-1",
    environmentId: "env-1",
    t3ProjectId: "proj-1",
    backsterosProjectId: "bproj-1",
    projectTitle: "Project",
    title: "Task",
    displayId: "BSH-1",
  };

  it("returns true when the bound chat is ready or failed", () => {
    const readyShells = new Map([
      [
        "env-1:thread-1",
        {
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          session: { status: "stopped" as const },
          backgroundLiveness: null,
        },
      ],
    ]);
    expect(
      shouldMarkBacksterosTaskInReviewAfterWorking({ binding, shellsByKey: readyShells }),
    ).toBe(true);

    const failedShells = new Map([
      [
        "env-1:thread-1",
        {
          hasPendingApprovals: false,
          hasPendingUserInput: false,
          session: { status: "error" as const },
          backgroundLiveness: null,
        },
      ],
    ]);
    expect(
      shouldMarkBacksterosTaskInReviewAfterWorking({ binding, shellsByKey: failedShells }),
    ).toBe(true);
  });

  it("returns false while waiting on approval or input", () => {
    expect(
      shouldMarkBacksterosTaskInReviewAfterWorking({
        binding,
        shellsByKey: new Map([
          [
            "env-1:thread-1",
            {
              hasPendingApprovals: true,
              hasPendingUserInput: false,
              session: { status: "running" as const },
              backgroundLiveness: null,
            },
          ],
        ]),
      }),
    ).toBe(false);

    expect(
      shouldMarkBacksterosTaskInReviewAfterWorking({
        binding,
        shellsByKey: new Map([
          [
            "env-1:thread-1",
            {
              hasPendingApprovals: false,
              hasPendingUserInput: true,
              session: { status: "stopped" as const },
              backgroundLiveness: null,
            },
          ],
        ]),
      }),
    ).toBe(false);
  });
});
