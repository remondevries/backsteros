import { describe, expect, it, beforeEach } from "vitest";

import {
  backsterosRailModeShortcutLabel,
  captureBacksterosProjectsRailResume,
  clearBacksterosGoLeader,
  isBacksterosGoLeaderPending,
  registerBacksterosGoLeader,
  resetBacksterosGoLeaderForTests,
  resolveBacksterosRailModeGoShortcut,
  resolveProjectsRailResumeLocation,
  BACKSTEROS_GO_LEADER_TIMEOUT_MS,
} from "./backsterosRailMode";

function keyEvent(
  key: string,
  init: Partial<KeyboardEvent> = {},
): Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "target"
> {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: null,
    ...init,
  };
}

describe("resolveBacksterosRailModeGoShortcut", () => {
  beforeEach(() => {
    resetBacksterosGoLeaderForTests();
  });

  it("arms on G and navigates on I / P", () => {
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("g"))).toEqual({
      kind: "arm",
    });
    expect(isBacksterosGoLeaderPending()).toBe(true);
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("i"))).toEqual({
      kind: "navigate",
      mode: "inbox",
    });
    expect(isBacksterosGoLeaderPending()).toBe(false);

    expect(resolveBacksterosRailModeGoShortcut(keyEvent("G"))).toEqual({
      kind: "arm",
    });
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("p"))).toEqual({
      kind: "navigate",
      mode: "projects",
    });
  });

  it("ignores bare I / P without a leader", () => {
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("i"))).toBeNull();
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("p"))).toBeNull();
  });

  it("does not arm G while typing in an editable field", () => {
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("g"), { editable: true })).toBeNull();
    expect(isBacksterosGoLeaderPending()).toBe(false);
  });

  it("allows the follow-up letter even if focus moved into an editable", () => {
    registerBacksterosGoLeader();
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("i"), { editable: true })).toEqual({
      kind: "navigate",
      mode: "inbox",
    });
  });

  it("cancels the chord on an unrelated follow-up key", () => {
    registerBacksterosGoLeader();
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("x"))).toBeNull();
    expect(isBacksterosGoLeaderPending()).toBe(false);
  });

  it("expires the leader after the timeout", () => {
    const armedAt = 1_000;
    resolveBacksterosRailModeGoShortcut(keyEvent("g"), { now: armedAt });
    expect(
      resolveBacksterosRailModeGoShortcut(keyEvent("i"), {
        now: armedAt + BACKSTEROS_GO_LEADER_TIMEOUT_MS,
      }),
    ).toBeNull();
  });

  it("rejects modified chords", () => {
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("g", { metaKey: true }))).toBeNull();
    registerBacksterosGoLeader();
    expect(resolveBacksterosRailModeGoShortcut(keyEvent("i", { altKey: true }))).toBeNull();
    clearBacksterosGoLeader();
  });
});

describe("backsterosRailModeShortcutLabel", () => {
  it("matches BacksterOS desktop Go hints", () => {
    expect(backsterosRailModeShortcutLabel("inbox")).toBe("G I");
    expect(backsterosRailModeShortcutLabel("projects")).toBe("G P");
  });
});

describe("captureBacksterosProjectsRailResume", () => {
  it("prefers an open draft chat over the project page", () => {
    expect(
      captureBacksterosProjectsRailResume({
        selectionProjectId: "proj-1",
        selectionProjectTitle: "Acme",
        selectionTaskId: "task-1",
        routeProjectId: "proj-1",
        draftId: "draft-9",
      }),
    ).toEqual({
      location: { kind: "draft", draftId: "draft-9" },
      taskDetail: { projectId: "proj-1", taskId: "task-1" },
    });
  });

  it("prefers an open thread chat over the project page", () => {
    expect(
      captureBacksterosProjectsRailResume({
        selectionProjectId: "proj-1",
        selectionTaskId: "task-1",
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toEqual({
      location: {
        kind: "thread",
        environmentId: "env-1",
        threadId: "thread-1",
      },
      taskDetail: { projectId: "proj-1", taskId: "task-1" },
    });
  });

  it("uses the task chat binding when the URL is still the project page", () => {
    expect(
      captureBacksterosProjectsRailResume({
        selectionProjectId: "proj-1",
        selectionProjectTitle: "Acme",
        selectionTaskId: "task-1",
        routeProjectId: "proj-1",
        binding: {
          kind: "draft",
          draftId: "draft-bound",
          threadId: "t",
          environmentId: "e",
          t3ProjectId: "t3",
          backsterosProjectId: "proj-1",
          projectTitle: "Acme",
          title: "Task",
          displayId: "ACM-1",
        },
      }),
    ).toEqual({
      location: { kind: "draft", draftId: "draft-bound" },
      taskDetail: { projectId: "proj-1", taskId: "task-1" },
    });
  });

  it("falls back to the project page when no chat route or binding is active", () => {
    expect(
      captureBacksterosProjectsRailResume({
        selectionProjectId: "proj-1",
        selectionProjectTitle: "Acme",
        selectionTaskId: "task-1",
      }),
    ).toEqual({
      location: {
        kind: "backsteros-project",
        projectId: "proj-1",
        title: "Acme",
      },
      taskDetail: { projectId: "proj-1", taskId: "task-1" },
    });
  });
});

describe("resolveProjectsRailResumeLocation", () => {
  it("keeps an explicit draft / thread location", () => {
    expect(
      resolveProjectsRailResumeLocation({
        location: { kind: "draft", draftId: "draft-1" },
        taskDetail: { projectId: "proj-1", taskId: "task-1" },
        binding: {
          kind: "draft",
          draftId: "draft-other",
          threadId: "t",
          environmentId: "e",
          t3ProjectId: "t3",
          backsterosProjectId: "proj-1",
          projectTitle: "Acme",
          title: "Task",
          displayId: "ACM-1",
        },
      }),
    ).toEqual({ kind: "draft", draftId: "draft-1" });
  });

  it("upgrades a project-only resume to the task chat binding", () => {
    expect(
      resolveProjectsRailResumeLocation({
        location: { kind: "backsteros-project", projectId: "proj-1" },
        taskDetail: { projectId: "proj-1", taskId: "task-1" },
        binding: {
          kind: "draft",
          draftId: "draft-bound",
          threadId: "t",
          environmentId: "e",
          t3ProjectId: "t3",
          backsterosProjectId: "proj-1",
          projectTitle: "Acme",
          title: "Task",
          displayId: "ACM-1",
        },
      }),
    ).toEqual({ kind: "draft", draftId: "draft-bound" });
  });

  it("leaves project resume alone when there is no task chat binding", () => {
    expect(
      resolveProjectsRailResumeLocation({
        location: { kind: "backsteros-project", projectId: "proj-1" },
        taskDetail: { projectId: "proj-1", taskId: "task-1" },
        binding: null,
      }),
    ).toEqual({ kind: "backsteros-project", projectId: "proj-1" });
  });
});
