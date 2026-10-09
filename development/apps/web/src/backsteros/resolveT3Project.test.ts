import { describe, expect, it } from "vite-plus/test";

import {
  resolveBacksterosProjectForWorkspaceRoot,
  resolveLogicalProjectKeyForBacksterosWorkingDirectory,
  resolveT3ProjectForBacksterosProject,
} from "./resolveT3Project";
import type { BacksterosCodebaseProject } from "./types";

function bosProject(
  overrides: Partial<BacksterosCodebaseProject> & Pick<BacksterosCodebaseProject, "id">,
): BacksterosCodebaseProject {
  return {
    key: null,
    name: "Project",
    summary: null,
    type: "codebase",
    status: "active",
    githubRepository: null,
    localWorkingDirectory: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveBacksterosProjectForWorkspaceRoot", () => {
  it("matches a BacksterOS project by normalized working directory", () => {
    const projects = [
      bosProject({ id: "a", localWorkingDirectory: "/tmp/other" }),
      bosProject({ id: "b", localWorkingDirectory: "/Users/me/BacksterOS/Projects/OS/Codebase/" }),
    ];
    expect(
      resolveBacksterosProjectForWorkspaceRoot(
        projects,
        "/Users/me/BacksterOS/Projects/OS/Codebase",
      )?.id,
    ).toBe("b");
  });

  it("returns null when no working directory matches", () => {
    expect(
      resolveBacksterosProjectForWorkspaceRoot(
        [bosProject({ id: "a", localWorkingDirectory: "/tmp/other" })],
        "/tmp/missing",
      ),
    ).toBeNull();
  });
});

describe("resolveT3ProjectForBacksterosProject", () => {
  it("finds the T3 project for a BacksterOS working directory", () => {
    const t3 = {
      id: "t3-1",
      environmentId: "env-1",
      workspaceRoot: "/tmp/bdv",
      title: "bdv",
    } as never;
    const bos = bosProject({ id: "bos-1", localWorkingDirectory: "/tmp/bdv" });
    expect(resolveT3ProjectForBacksterosProject([t3], bos)).toEqual(t3);
  });
});

describe("resolveLogicalProjectKeyForBacksterosWorkingDirectory", () => {
  const settings = {
    sidebarProjectGroupingMode: "separate" as const,
    sidebarProjectGroupingOverrides: {},
  };

  it("prefers an explicit project key", () => {
    expect(
      resolveLogicalProjectKeyForBacksterosWorkingDirectory({
        workspaceRoot: "/tmp/bdv",
        explicitProjectKey: "explicit-key",
        groups: [],
        projects: [],
        settings,
      }),
    ).toBe("explicit-key");
  });

  it("resolves from a settings group member path", () => {
    expect(
      resolveLogicalProjectKeyForBacksterosWorkingDirectory({
        workspaceRoot: "/tmp/bdv/",
        groups: [
          {
            projectKey: "group-key",
            workspaceRoot: "/tmp/other",
            memberProjects: [{ workspaceRoot: "/tmp/bdv" }],
          },
        ],
        projects: [],
        settings,
      }),
    ).toBe("group-key");
  });

  it("falls back to a direct T3 project match", () => {
    const t3 = {
      id: "t3-1",
      environmentId: "env-1",
      workspaceRoot: "/tmp/bdv",
      title: "bdv",
    } as never;
    expect(
      resolveLogicalProjectKeyForBacksterosWorkingDirectory({
        workspaceRoot: "/tmp/bdv",
        groups: [],
        projects: [t3],
        settings,
      }),
    ).toBe("env-1:/tmp/bdv");
  });
});
