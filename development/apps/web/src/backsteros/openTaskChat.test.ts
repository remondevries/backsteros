import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  clearBacksterosTaskChatSession,
  isBacksterosTaskChatActive,
  resolveActiveBacksterosTaskChatBinding,
  resolveActiveBacksterosTaskId,
} from "./openTaskChat";
import { useBacksterosTaskChatStore, type BacksterosTaskChatBinding } from "./taskChatStore";

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

describe("openTaskChat helpers", () => {
  beforeEach(() => {
    useBacksterosTaskChatStore.setState({ byTaskId: {} });
  });

  it("matches draft and server routes to task bindings", () => {
    expect(
      isBacksterosTaskChatActive(draftBinding, { kind: "draft", draftId: "draft-1" }),
    ).toBe(true);
    expect(
      isBacksterosTaskChatActive(draftBinding, { kind: "draft", draftId: "draft-2" }),
    ).toBe(false);

    expect(
      isBacksterosTaskChatActive(draftBinding, {
        kind: "server",
        threadKey: "env-1:thread-1",
      }),
    ).toBe(true);

    const threadBinding: BacksterosTaskChatBinding = {
      ...draftBinding,
      kind: "thread",
      threadId: "thread-9",
    };
    expect(
      isBacksterosTaskChatActive(threadBinding, {
        kind: "server",
        threadKey: "env-1:thread-9",
      }),
    ).toBe(true);
  });

  it("resolves the active task id from the route", () => {
    expect(
      resolveActiveBacksterosTaskId({
        byTaskId: { "task-a": draftBinding },
        route: { kind: "draft", draftId: "draft-1" },
      }),
    ).toBe("task-a");
  });

  it("resolves the active binding for breadcrumb labels", () => {
    expect(
      resolveActiveBacksterosTaskChatBinding({
        byTaskId: { "task-a": draftBinding },
        route: { kind: "draft", draftId: "draft-1" },
      }),
    ).toEqual(draftBinding);
  });

  it("clears a task chat into a fresh draft for the same task", async () => {
    useBacksterosTaskChatStore.getState().setBinding("task-a", draftBinding);
    const navigations: Array<{
      to: string;
      params?: Record<string, string>;
      replace?: boolean;
    }> = [];

    const ok = await clearBacksterosTaskChatSession({
      taskId: "task-a",
      navigate: async (opts) => {
        navigations.push(opts);
      },
    });

    expect(ok).toBe(true);
    const next = useBacksterosTaskChatStore.getState().getBinding("task-a");
    expect(next?.kind).toBe("draft");
    expect(next?.draftId).not.toBe("draft-1");
    expect(next?.threadId).not.toBe("thread-1");
    expect(next?.title).toBe("Ship it");
    expect(next?.displayId).toBe("BOD-1");
    expect(next?.backsterosProjectId).toBe("bos-1");
    expect(navigations).toEqual([
      {
        to: "/draft/$draftId",
        params: { draftId: next?.draftId },
        replace: true,
      },
    ]);
  });
});
