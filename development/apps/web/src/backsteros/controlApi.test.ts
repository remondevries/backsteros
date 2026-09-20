import { beforeEach, describe, expect, it } from "vitest";

import { mergeControlBindingsIntoTaskChatStore } from "./controlApi";
import { useBacksterosTaskChatStore } from "./taskChatStore";

describe("mergeControlBindingsIntoTaskChatStore", () => {
  beforeEach(() => {
    useBacksterosTaskChatStore.setState({ byTaskId: {}, retiredThreadKeys: [] });
  });

  it("applies missing server bindings and skips drafts", () => {
    useBacksterosTaskChatStore.getState().setBinding("task-draft", {
      kind: "draft",
      draftId: "draft-1",
      threadId: "thread-draft",
      environmentId: "env-1",
      t3ProjectId: "proj-1",
      backsterosProjectId: "bos-1",
      projectTitle: "BDV",
      title: "Draft",
      displayId: "BDV-1",
    });

    const applied = mergeControlBindingsIntoTaskChatStore([
      {
        taskId: "task-draft",
        kind: "thread",
        threadId: "thread-server",
        environmentId: "env-1",
        t3ProjectId: "proj-1",
        backsterosProjectId: "bos-1",
        projectTitle: "BDV",
        title: "Draft",
        displayId: "BDV-1",
      },
      {
        taskId: "task-api",
        kind: "thread",
        threadId: "thread-api",
        environmentId: "env-1",
        t3ProjectId: "proj-1",
        backsterosProjectId: "bos-1",
        projectTitle: "BDV",
        title: "API",
        displayId: "BDV-2",
      },
    ]);

    expect(applied).toBe(1);
    expect(useBacksterosTaskChatStore.getState().getBinding("task-draft")?.kind).toBe("draft");
    expect(useBacksterosTaskChatStore.getState().getBinding("task-api")?.threadId).toBe(
      "thread-api",
    );
  });
});
