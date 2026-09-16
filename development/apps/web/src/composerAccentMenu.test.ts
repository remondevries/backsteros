import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  applyComposerColorMenuAction,
  isComposerColorMenuAction,
  resolveComposerAccentForMenu,
} from "./composerAccentMenu";
import { useComposerAccentStore } from "./composerAccentStore";
import { useBacksterosTaskChatStore } from "./backsteros/taskChatStore";
import { PROVIDER_ACCENT_SWATCHES, resolveComposerAccentColor } from "./providerAccentColors";

describe("composer accent overrides", () => {
  beforeEach(() => {
    useComposerAccentStore.setState({ overrides: {} });
    for (const taskId of Object.keys(useBacksterosTaskChatStore.getState().byTaskId)) {
      useBacksterosTaskChatStore.getState().clearBinding(taskId);
    }
  });

  it("prefers an override over provider accent and hash", () => {
    expect(
      resolveComposerAccentColor({
        threadId: "thread-1",
        instanceId: "cursor",
        accentColor: "#38BDF8",
        overrideColor: "#F87171",
      }),
    ).toBe("#F87171");
  });

  it("stores overrides under task: when a task binding exists", () => {
    useBacksterosTaskChatStore.getState().setBinding("task-1", {
      kind: "thread",
      threadId: "thread-1",
      environmentId: "env-1",
      t3ProjectId: "proj-1",
      backsterosProjectId: "bos-1",
      projectTitle: "Demo",
      title: "Task",
      displayId: "BSH-1",
    });
    expect(
      applyComposerColorMenuAction({
        action: `color:${PROVIDER_ACCENT_SWATCHES[5]}`,
        threadId: "thread-1",
        environmentId: "env-1",
      }),
    ).toBe(true);
    expect(useComposerAccentStore.getState().overrides["task:task-1"]).toBe(
      PROVIDER_ACCENT_SWATCHES[5],
    );
    expect(
      resolveComposerAccentForMenu({
        threadId: "thread-1",
        environmentId: "env-1",
        instanceId: "cursor",
      }),
    ).toBe(PROVIDER_ACCENT_SWATCHES[5]);
  });

  it("stores overrides under thread: when unbound", () => {
    expect(
      applyComposerColorMenuAction({
        action: `color:${PROVIDER_ACCENT_SWATCHES[2]}`,
        threadId: "thread-solo",
      }),
    ).toBe(true);
    expect(useComposerAccentStore.getState().overrides["thread:thread-solo"]).toBe(
      PROVIDER_ACCENT_SWATCHES[2],
    );
  });

  it("clears overrides via color:clear", () => {
    applyComposerColorMenuAction({
      action: `color:${PROVIDER_ACCENT_SWATCHES[0]}`,
      threadId: "thread-clear",
    });
    expect(isComposerColorMenuAction("color:clear")).toBe(true);
    applyComposerColorMenuAction({
      action: "color:clear",
      threadId: "thread-clear",
    });
    expect(useComposerAccentStore.getState().overrides["thread:thread-clear"]).toBeUndefined();
  });
});
