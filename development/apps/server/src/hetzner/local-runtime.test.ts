// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalDate:off preferSchemaOverJson:off globalTimers:off unknownInEffectCatch:off anyUnknownInErrorContext:off catchToOrElseSucceed:off
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bdv-local-runtime-"));

vi.spyOn(os, "homedir").mockReturnValue(tmpHome);

const {
  composeProjectNameFromDir,
  matchReasonsForContainer,
  normalizeComposeProjectName,
  pathsRelated,
  resolveProjectRuntimeStack,
  setRuntimeAttachments,
  listRuntimeAttachments,
} = await import("./local-runtime.ts");

describe("local-runtime", () => {
  beforeEach(() => {
    fs.rmSync(path.join(tmpHome, ".config"), { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(path.join(tmpHome, ".config"), { recursive: true, force: true });
  });

  it("normalizes compose project names", () => {
    expect(normalizeComposeProjectName("Codebase")).toBe("codebase");
    expect(normalizeComposeProjectName("My Project!")).toBe("myproject");
    expect(composeProjectNameFromDir("/Users/me/BacksterOS/Projects/OS/Codebase")).toBe("codebase");
  });

  it("treats ancestor and descendant paths as related", () => {
    expect(
      pathsRelated(
        "/Users/me/BacksterOS/Projects/OS/Codebase",
        "/Users/me/BacksterOS/Projects/OS/Codebase/development",
      ),
    ).toBe(true);
    expect(pathsRelated("/tmp/a", "/tmp/b")).toBe(false);
    expect(pathsRelated(null, "/tmp/a")).toBe(false);
  });

  it("auto-discovers compose near cwd and does not match unrelated Codebase folders", () => {
    const osCwd = path.join(tmpHome, "OS", "Codebase");
    const ldpCwd = path.join(tmpHome, "LDP", "Codebase");
    fs.mkdirSync(osCwd, { recursive: true });
    fs.mkdirSync(ldpCwd, { recursive: true });
    fs.writeFileSync(path.join(osCwd, "docker-compose.yml"), "services: {}\n");

    const osStack = resolveProjectRuntimeStack(osCwd, []);
    expect(osStack.composeSource).toBe("auto");
    expect(osStack.composeFile).toBe(path.join(osCwd, "docker-compose.yml"));
    expect(osStack.canStart).toBe(true);

    const ldpStack = resolveProjectRuntimeStack(ldpCwd, []);
    expect(ldpStack.composeFile).toBeNull();
    expect(ldpStack.canStart).toBe(false);

    const container = {
      id: "1",
      name: "backsteros-postgres",
      image: "postgres:17",
      status: "Up 4 days",
      state: "running" as const,
      composeProject: "codebase",
      composeService: "postgres",
      composeWorkingDir: osCwd,
      composeConfigFiles: path.join(osCwd, "docker-compose.yml"),
      ports: "",
    };
    expect(
      matchReasonsForContainer(
        container,
        osCwd,
        [],
        osStack.composeFile ? [osStack.composeFile] : [],
      ),
    ).toContain("working-dir");
    expect(matchReasonsForContainer(container, ldpCwd, [], [])).toEqual([]);
  });

  it("persists compose and command attachments", () => {
    const saved = setRuntimeAttachments("projAtt99", [
      {
        kind: "compose",
        label: "Local stack",
        composeFile: "docker-compose.yml",
        composeProjectName: "codebase",
      },
      {
        kind: "command",
        label: "Vite",
        startCommand: "npm run dev",
        stopCommand: "echo stop",
        cwd: "/tmp/app",
      },
    ]);
    expect(saved).toHaveLength(2);
    expect(saved[0]?.kind).toBe("compose");
    expect(saved[0]?.composeProjectName).toBe("codebase");
    expect(saved[1]?.kind).toBe("command");
    expect(saved[1]?.startCommand).toBe("npm run dev");

    const listed = listRuntimeAttachments("projAtt99");
    expect(listed.map((entry) => entry.label)).toEqual(["Local stack", "Vite"]);
  });
});
