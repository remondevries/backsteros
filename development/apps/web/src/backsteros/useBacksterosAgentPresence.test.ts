import { describe, expect, it } from "vitest";

import { useBacksterosAgentPresenceStore } from "./agentPresenceStore";
import {
  applyBacksterosAgentPresenceSseData,
  mergeBacksterosDisplayedWorkingTaskIds,
} from "./useBacksterosAgentPresence";

describe("mergeBacksterosDisplayedWorkingTaskIds", () => {
  it("returns local ids when remote is empty", () => {
    const local = new Set(["a", "b"]);
    expect(
      mergeBacksterosDisplayedWorkingTaskIds({
        localWorkingTaskIds: local,
        remoteWorkingTaskIds: new Set(),
      }),
    ).toBe(local);
  });

  it("returns remote ids when local is empty", () => {
    const remote = new Set(["r"]);
    expect(
      mergeBacksterosDisplayedWorkingTaskIds({
        localWorkingTaskIds: new Set(),
        remoteWorkingTaskIds: remote,
      }),
    ).toBe(remote);
  });

  it("unions local and remote", () => {
    const merged = mergeBacksterosDisplayedWorkingTaskIds({
      localWorkingTaskIds: new Set(["a"]),
      remoteWorkingTaskIds: new Set(["a", "b"]),
    });
    expect([...merged].sort()).toEqual(["a", "b"]);
  });
});

describe("clearRemoteWorkingTaskId", () => {
  it("drops a stale remote id so the pulse can stop before the next poll", () => {
    const store = useBacksterosAgentPresenceStore.getState();
    store.setRemoteWorkingTaskIds(new Set(["task-1", "task-2"]));
    store.clearRemoteWorkingTaskId("task-1");
    expect([...useBacksterosAgentPresenceStore.getState().remoteWorkingTaskIds]).toEqual([
      "task-2",
    ]);
    store.clearRemoteWorkingTaskId("task-2");
    expect(useBacksterosAgentPresenceStore.getState().remoteWorkingTaskIds.size).toBe(0);
  });
});

describe("applyBacksterosAgentPresenceSseData", () => {
  it("adds and clears remote ids from agent.presence frames", () => {
    const store = useBacksterosAgentPresenceStore.getState();
    store.setRemoteWorkingTaskIds(new Set());
    applyBacksterosAgentPresenceSseData(JSON.stringify({ taskId: "task-9", live: true }));
    expect([...useBacksterosAgentPresenceStore.getState().remoteWorkingTaskIds]).toEqual([
      "task-9",
    ]);
    applyBacksterosAgentPresenceSseData(JSON.stringify({ taskId: "task-9", live: false }));
    expect(useBacksterosAgentPresenceStore.getState().remoteWorkingTaskIds.size).toBe(0);
  });
});
