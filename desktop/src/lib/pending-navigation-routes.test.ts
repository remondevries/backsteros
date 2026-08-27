import { describe, expect, it } from "vitest";

import { resolvePendingPageSurface } from "./pending-navigation-routes";

describe("resolvePendingPageSurface", () => {
  it("keeps list vs task-detail distinct", () => {
    expect(resolvePendingPageSurface("/tasks")).toBe("tasks-list");
    expect(resolvePendingPageSurface("/journal-v2")).toBe("journal-v2");
    expect(resolvePendingPageSurface("/journal-v2/2026-08-26")).toBe(
      "journal-v2",
    );
    expect(resolvePendingPageSurface("/habits-v2")).toBe("habits-v2");
    expect(resolvePendingPageSurface("/habits-v2/habit-1")).toBe("habits-v2");
    expect(resolvePendingPageSurface("/knowledge-v2")).toBe("knowledge-v2");
    expect(resolvePendingPageSurface("/knowledge-v2/note")).toBe(
      "knowledge-v2",
    );
    expect(resolvePendingPageSurface("/letters-v2")).toBe("letters-v2");
    expect(resolvePendingPageSurface("/letters-v2/l-1")).toBe("letters-v2");
    expect(resolvePendingPageSurface("/tasks/today/BSH-1")).toBe("task-detail");
    expect(resolvePendingPageSurface("/projects/CA/tasks/BSH-1")).toBe(
      "task-detail",
    );
    expect(resolvePendingPageSurface("/projects/CA/tasks")).toBe("projects");
  });

  it("does not treat splat folder names as task or letter routes", () => {
    expect(resolvePendingPageSurface("/knowledge/tasks/notes")).toBe(
      "knowledge",
    );
    expect(resolvePendingPageSurface("/knowledge/letters/draft")).toBe(
      "knowledge",
    );
    expect(
      resolvePendingPageSurface("/projects/CA/files/src/tasks/foo.ts"),
    ).toBe("projects");
    expect(
      resolvePendingPageSurface("/projects/CA/documents/letters/intro"),
    ).toBe("projects");
  });
});
