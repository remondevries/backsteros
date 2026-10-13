import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  canAutoPromoteBacksterosTaskStatus,
  markBacksterosTaskInProgressForAgent,
  markBacksterosTaskInReviewForAgent,
  shouldMarkBacksterosTaskInReviewAfterWorking,
} from "./promoteWorkingTask";

vi.mock("./client", () => ({
  fetchBacksterosTask: vi.fn(),
  fetchBacksterosContacts: vi.fn(),
  updateBacksterosTask: vi.fn(),
}));

import { fetchBacksterosContacts, fetchBacksterosTask, updateBacksterosTask } from "./client";

const fetchMock = vi.mocked(fetchBacksterosTask);
const fetchContactsMock = vi.mocked(fetchBacksterosContacts);
const updateMock = vi.mocked(updateBacksterosTask);

afterEach(() => {
  vi.clearAllMocks();
});

describe("markBacksterosTaskInProgressForAgent", () => {
  it("does not reopen a completed task at turn start", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "completed",
    } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);

    await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("task-1");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("skips canceled and duplicated tasks at turn start", async () => {
    for (const status of ["canceled", "duplicated"] as const) {
      fetchMock.mockResolvedValue({
        id: "task-1",
        status,
      } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);

      await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(false);
      expect(updateMock).not.toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it("promotes an open task to in_progress with the coding-agent working marker", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "in_review",
      relatedContactIds: ["sander-contact"],
    } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("task-1");
    expect(fetchContactsMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_progress",
      activityActor: "agent",
      agentWorkingContactId: "sander-contact",
      agentWorkingKind: "working",
      agentWorkingLabel: "Coding agent running",
    });
  });

  it("falls back to Sander from contacts when related is empty", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "ready_to_start",
      relatedContactIds: [],
    } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    fetchContactsMock.mockResolvedValue([
      { id: "other", name: "Ralph" },
      { id: "sander-id", name: "Sander", firstName: "Sander" },
    ] as unknown as Awaited<ReturnType<typeof fetchBacksterosContacts>>);
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInProgressForAgent("task-1")).resolves.toBe(true);
    expect(fetchContactsMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_progress",
      activityActor: "agent",
      agentWorkingContactId: "sander-id",
      agentWorkingKind: "working",
      agentWorkingLabel: "Coding agent running",
    });
  });
});

describe("markBacksterosTaskInReviewForAgent", () => {
  it("does not promote a completed task when the bound thread is idle", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "completed",
    } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);

    await expect(markBacksterosTaskInReviewForAgent("task-1")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("task-1");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("promotes an in_progress task to in_review when work is done", async () => {
    fetchMock.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
    } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    updateMock.mockResolvedValue({
      id: "task-1",
      status: "in_review",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await expect(markBacksterosTaskInReviewForAgent("task-1")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("task-1");
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      status: "in_review",
      activityActor: "agent",
    });
  });

  it("skips canceled and duplicated tasks", async () => {
    for (const status of ["canceled", "duplicated"] as const) {
      fetchMock.mockResolvedValue({
        id: "task-1",
        status,
      } as unknown as Awaited<ReturnType<typeof fetchBacksterosTask>>);

      await expect(markBacksterosTaskInReviewForAgent("task-1")).resolves.toBe(false);
      expect(updateMock).not.toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });
});

describe("canAutoPromoteBacksterosTaskStatus", () => {
  it("matches the control API closed-status rule", () => {
    expect(canAutoPromoteBacksterosTaskStatus("completed")).toBe(false);
    expect(canAutoPromoteBacksterosTaskStatus("in_progress")).toBe(true);
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
