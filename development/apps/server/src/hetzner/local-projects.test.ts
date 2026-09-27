import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bdv-local-projects-"));

vi.spyOn(os, "homedir").mockReturnValue(tmpHome);

const { listLocalProjects, syncLocalProjects } = await import("./local-projects.ts");

describe("local-projects", () => {
  beforeEach(() => {
    fs.rmSync(path.join(tmpHome, ".config"), { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(path.join(tmpHome, ".config"), { recursive: true, force: true });
  });

  it("discovers secrets environment folders", () => {
    const id = "29b55921-bf65-4ddf-8c5a-f2fbc4d607ce";
    fs.mkdirSync(path.join(tmpHome, ".config", "secrets", "environments", id), {
      recursive: true,
    });
    const listed = listLocalProjects();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.projectId).toBe(id);
    expect(listed[0]?.hasSecretsFolder).toBe(true);
  });

  it("merges BacksterOS enrichment and keeps working-directory projects", () => {
    const id = "projLocal123";
    const synced = syncLocalProjects([
      {
        projectId: id,
        key: "LDP",
        name: "portal.lemo-design.com",
        localWorkingDirectory: "/Users/me/BacksterOS/Projects/LDP/Codebase",
      },
    ]);
    expect(synced).toHaveLength(1);
    expect(synced[0]?.key).toBe("LDP");
    expect(synced[0]?.localWorkingDirectory).toContain("/LDP/Codebase");

    const again = listLocalProjects();
    expect(again[0]?.name).toBe("portal.lemo-design.com");
  });

  it("keeps only codebase enrichment ids when allowlist is provided", () => {
    const codebaseId = "codebaseProject99";
    const otherId = "otherTypeProject88";
    fs.mkdirSync(path.join(tmpHome, ".config", "secrets", "environments", codebaseId), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpHome, ".config", "secrets", "environments", otherId), {
      recursive: true,
    });

    const synced = syncLocalProjects([
      {
        projectId: codebaseId,
        key: "CB",
        name: "Codebase App",
        localWorkingDirectory: "/tmp/cb",
      },
    ]);
    expect(synced.map((p) => p.projectId)).toEqual([codebaseId]);
    expect(synced[0]?.key).toBe("CB");
  });
});
