import { describe, expect, it } from "vite-plus/test";

import {
  captureSidebarModeResumeLocation,
  sidebarModeResumeLocationsEqual,
} from "./sidebarModeStore";

describe("captureSidebarModeResumeLocation", () => {
  it("prefers draft over thread and BacksterOS project", () => {
    expect(
      captureSidebarModeResumeLocation({
        draftId: "draft-1",
        environmentId: "env-1",
        threadId: "thread-1",
        backsterosProjectId: "project-1",
      }),
    ).toEqual({ kind: "draft", draftId: "draft-1" });
  });

  it("captures thread when no draft is active", () => {
    expect(
      captureSidebarModeResumeLocation({
        environmentId: "env-1",
        threadId: "thread-1",
        backsterosProjectId: "project-1",
      }),
    ).toEqual({
      kind: "thread",
      environmentId: "env-1",
      threadId: "thread-1",
    });
  });

  it("captures BacksterOS project when no chat route is active", () => {
    expect(
      captureSidebarModeResumeLocation({
        backsterosProjectId: "project-1",
        backsterosProjectTitle: "Acme",
      }),
    ).toEqual({
      kind: "backsteros-project",
      projectId: "project-1",
      title: "Acme",
    });
  });

  it("falls back to home", () => {
    expect(captureSidebarModeResumeLocation({})).toEqual({ kind: "home" });
  });
});

describe("sidebarModeResumeLocationsEqual", () => {
  it("compares by kind and identity fields", () => {
    expect(sidebarModeResumeLocationsEqual({ kind: "home" }, { kind: "home" })).toBe(true);
    expect(
      sidebarModeResumeLocationsEqual(
        { kind: "draft", draftId: "a" },
        { kind: "draft", draftId: "b" },
      ),
    ).toBe(false);
    expect(
      sidebarModeResumeLocationsEqual(
        { kind: "backsteros-project", projectId: "p1", title: "A" },
        { kind: "backsteros-project", projectId: "p1", title: "B" },
      ),
    ).toBe(true);
  });
});
