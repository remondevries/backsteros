import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearBacksterosTaskChatSettleRequests,
  registerBacksterosTaskChatSettleHandler,
  settleBoundBacksterosTaskChatIfCompleted,
} from "./settleTaskChatOnComplete";
import { useBacksterosTaskChatStore } from "./taskChatStore";

afterEach(() => {
  clearBacksterosTaskChatSettleRequests();
  for (const taskId of Object.keys(useBacksterosTaskChatStore.getState().byTaskId)) {
    useBacksterosTaskChatStore.getState().clearBinding(taskId);
  }
});

describe("settleBoundBacksterosTaskChatIfCompleted", () => {
  it("settles the bound chat once when status becomes completed", () => {
    useBacksterosTaskChatStore.getState().setBinding("task-1", {
      kind: "thread",
      threadId: "thread-1",
      environmentId: "env-1",
      t3ProjectId: "t3",
      backsterosProjectId: "bos",
      projectTitle: "Project",
      title: "Task",
      displayId: "BSH-1",
    });
    const settle = vi.fn();
    const unregister = registerBacksterosTaskChatSettleHandler(settle);

    settleBoundBacksterosTaskChatIfCompleted("task-1", "completed");
    settleBoundBacksterosTaskChatIfCompleted("task-1", "completed");

    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith({
      environmentId: "env-1",
      threadId: "thread-1",
    });

    unregister();
  });

  it("ignores non-completed statuses and unbound tasks", () => {
    const settle = vi.fn();
    registerBacksterosTaskChatSettleHandler(settle);
    settleBoundBacksterosTaskChatIfCompleted("missing", "completed");
    settleBoundBacksterosTaskChatIfCompleted("task-1", "in_review");
    expect(settle).not.toHaveBeenCalled();
  });

  it("allows a later settle after the task leaves completed", () => {
    useBacksterosTaskChatStore.getState().setBinding("task-1", {
      kind: "thread",
      threadId: "thread-1",
      environmentId: "env-1",
      t3ProjectId: "t3",
      backsterosProjectId: "bos",
      projectTitle: "Project",
      title: "Task",
      displayId: "BSH-1",
    });
    const settle = vi.fn();
    registerBacksterosTaskChatSettleHandler(settle);

    settleBoundBacksterosTaskChatIfCompleted("task-1", "completed");
    settleBoundBacksterosTaskChatIfCompleted("task-1", "in_progress");
    settleBoundBacksterosTaskChatIfCompleted("task-1", "completed");

    expect(settle).toHaveBeenCalledTimes(2);
  });
});
