import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  backsterosTaskLogicalProjectKey,
  collectBacksterosVibeHiddenChatKeys,
  isBacksterosTaskLogicalProjectKey,
  useBacksterosTaskChatStore,
  type BacksterosTaskChatBinding,
} from "./taskChatStore";

const draftBinding: BacksterosTaskChatBinding = {
  kind: "draft",
  draftId: "draft-1",
  threadId: "thread-1",
  environmentId: "env-1",
  t3ProjectId: "project-1",
  backsterosProjectId: "bos-1",
  projectTitle: "BacksterOS Desktop",
  title: "Ship it",
  displayId: "BOD-1",
};

const threadBinding: BacksterosTaskChatBinding = {
  kind: "thread",
  threadId: "thread-9",
  environmentId: "env-2",
  t3ProjectId: "project-2",
  backsterosProjectId: "bos-2",
  projectTitle: "Hub",
  title: "Fix sync",
  displayId: "HUB-3",
};

describe("backsteros task chat keys", () => {
  beforeEach(() => {
    useBacksterosTaskChatStore.setState({ byTaskId: {}, retiredThreadKeys: [] });
  });

  it("builds and recognizes task logical project keys", () => {
    expect(backsterosTaskLogicalProjectKey("task-a")).toBe("backsteros:task:task-a");
    expect(isBacksterosTaskLogicalProjectKey("backsteros:task:task-a")).toBe(true);
    expect(isBacksterosTaskLogicalProjectKey("env-1:project-1")).toBe(false);
  });

  it("collects draft ids and thread keys for vibe-mode hiding", () => {
    const hidden = collectBacksterosVibeHiddenChatKeys({
      byTaskId: {
        "task-a": draftBinding,
        "task-b": threadBinding,
      },
      retiredThreadKeys: ["env-3:thread-old"],
    });
    expect([...hidden.draftIds].toSorted()).toEqual(["draft-1"]);
    expect([...hidden.threadKeys].toSorted()).toEqual([
      "env-1:thread-1",
      "env-2:thread-9",
      "env-3:thread-old",
    ]);
  });

  it("retires prior thread keys when a binding is cleared or replaced", () => {
    const store = useBacksterosTaskChatStore.getState();
    store.setBinding("task-a", draftBinding);
    store.clearBinding("task-a");
    expect(useBacksterosTaskChatStore.getState().retiredThreadKeys).toEqual(["env-1:thread-1"]);

    store.setBinding("task-a", draftBinding);
    store.setBinding("task-a", {
      ...threadBinding,
      kind: "thread",
      threadId: "thread-next",
      environmentId: "env-1",
    });
    // Previous draft thread was already retired; replacement does not duplicate.
    expect(useBacksterosTaskChatStore.getState().retiredThreadKeys).toEqual(["env-1:thread-1"]);
    expect(
      collectBacksterosVibeHiddenChatKeys({
        byTaskId: useBacksterosTaskChatStore.getState().byTaskId,
        retiredThreadKeys: useBacksterosTaskChatStore.getState().retiredThreadKeys,
      }).threadKeys.has("env-1:thread-next"),
    ).toBe(true);
  });
});
