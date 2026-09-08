import { describe, expect, it } from "vite-plus/test";

import { resolveBacksterosComposeProject } from "./resolveBacksterosComposeProject";
import type { BacksterosCodebaseProject } from "./types";

function project(id: string, name = id): BacksterosCodebaseProject {
  return {
    id,
    key: id.toUpperCase(),
    name,
    summary: null,
    type: "software",
    status: "active",
    githubRepository: null,
    localWorkingDirectory: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveBacksterosComposeProject", () => {
  const alpha = project("alpha", "Alpha");
  const beta = project("beta", "Beta");
  const projects = [alpha, beta];

  it("prefers the open task project", () => {
    expect(
      resolveBacksterosComposeProject({
        selectedProject: beta,
        routeProjectId: "alpha",
        projects,
      }),
    ).toBe(beta);
  });

  it("prefers the live list entry when the selected project is stale", () => {
    const staleBeta = project("beta", "Beta (stale)");
    expect(
      resolveBacksterosComposeProject({
        selectedProject: staleBeta,
        projects,
      }),
    ).toBe(beta);
  });

  it("uses the route project when nothing is selected", () => {
    expect(
      resolveBacksterosComposeProject({
        routeProjectId: "beta",
        projects,
      }),
    ).toBe(beta);
  });

  it("falls back through remembered project ids", () => {
    expect(
      resolveBacksterosComposeProject({
        rememberedProjectIds: ["missing", "beta"],
        projects,
      }),
    ).toBe(beta);
  });

  it("falls back to the first loaded project so compose can open from inbox", () => {
    expect(
      resolveBacksterosComposeProject({
        projects,
      }),
    ).toBe(alpha);
  });

  it("returns null when there are no projects", () => {
    expect(resolveBacksterosComposeProject({ projects: [] })).toBeNull();
    expect(resolveBacksterosComposeProject({})).toBeNull();
  });
});
