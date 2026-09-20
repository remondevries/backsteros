import { beforeEach, describe, expect, it } from "vitest";

import { mergeControlBindingsIntoTaskChatStore } from "./controlApi";
import { useBacksterosTaskChatStore } from "./taskChatStore";

describe("mergeControlBindingsIntoTaskChatStore", () => {
  beforeEach(() => {
    useBacksterosTaskChatStore.setState({ byTaskId: {}, retiredThreadKeys: [] });
  });

  it("applies missing server bindings", () => {
    const applied = mergeControlBindingsIntoTaskChatStore([
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
    expect(useBacksterosTaskChatStore.getState().getBinding("task-api")?.threadId).toBe(
      "thread-api",
    );
  });

  it("upgrades a local kickoff draft to the server thread binding", () => {
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
    ]);

    expect(applied).toBe(1);
    const binding = useBacksterosTaskChatStore.getState().getBinding("task-draft");
    expect(binding?.kind).toBe("thread");
    expect(binding?.threadId).toBe("thread-server");
  });

  it("skips identical thread bindings", () => {
    useBacksterosTaskChatStore.getState().setBinding("task-same", {
      kind: "thread",
      threadId: "thread-1",
      environmentId: "env-1",
      t3ProjectId: "proj-1",
      backsterosProjectId: "bos-1",
      projectTitle: "BDV",
      title: "Same",
      displayId: "BDV-3",
    });

    const applied = mergeControlBindingsIntoTaskChatStore([
      {
        taskId: "task-same",
        kind: "thread",
        threadId: "thread-1",
        environmentId: "env-1",
        t3ProjectId: "proj-1",
        backsterosProjectId: "bos-1",
        projectTitle: "BDV",
        title: "Same",
        displayId: "BDV-3",
      },
    ]);

    expect(applied).toBe(0);
  });
});
