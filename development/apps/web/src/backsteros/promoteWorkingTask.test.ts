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
  it("patches open tasks to in_progress", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "backlog",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_progress",
      activityActor: "agent",
    });
  });

  it("skips tasks already in progress", async () => {
    fetchMock.mockResolvedValueOnce({
      id: "task-1",
      status: "in_progress",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("reopens completed (and other) tasks to in_progress when the agent works", async () => {
    fetchMock.mockResolvedValue({
      id: "task-2",
      status: "completed",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    updateMock.mockResolvedValue({
      id: "task-2",
      status: "in_progress",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInProgressForAgent("task-2")).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalledWith("task-2", {
      status: "in_progress",
      activityActor: "agent",
    });
  });
});

describe("markBacksterosTaskInReviewForAgent", () => {
  it("patches in_progress tasks to in_review", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_review",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInReviewForAgent("task-1")).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_review",
      activityActor: "agent",
    });
  });

  it("skips tasks already in review, triage, or terminal", async () => {
    fetchMock.mockResolvedValueOnce({
      id: "task-1",
      status: "in_review",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    await expect(markBacksterosTaskInReviewForAgent("task-1")).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({
      id: "task-2",
      status: "triage",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    await expect(markBacksterosTaskInReviewForAgent("task-2")).resolves.toBe(false);

    fetchMock.mockResolvedValueOnce({
      id: "task-3",
      status: "completed",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    await expect(markBacksterosTaskInReviewForAgent("task-3")).resolves.toBe(false);

    expect(updateMock).not.toHaveBeenCalled();
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

  it("returns true only when the bound chat is ready", () => {
    const shellsByKey = new Map([
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
    expect(shouldMarkBacksterosTaskInReviewAfterWorking({ binding, shellsByKey })).toBe(true);
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
