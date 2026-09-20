import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import {
  isControlLoopbackRemote,
  matchControlT3Project,
  resolveControlWorkspaceRoot,
} from "./control.ts";
import { buildControlKickoffPrompt, parseBacksterosDisplayId } from "./control-backsteros.ts";
import {
  findBacksterosTaskThreadBinding,
  listBacksterosTaskThreadBindings,
  readBacksterosTaskThreadBindings,
  writeBacksterosTaskThreadBinding,
} from "./task-thread-bindings.ts";

describe("backsteros task-thread bindings", () => {
  it("round-trips a binding through disk", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "bdv-bindings-"));
    try {
      const written = writeBacksterosTaskThreadBinding(stateDir, "task-1", {
        threadId: "thread-1",
        environmentId: "env-1",
        t3ProjectId: "proj-1",
        backsterosProjectId: "bos-1",
        projectTitle: "BDV",
        title: "Demo",
        displayId: "BDV-1",
      });
      expect(written.kind).toBe("thread");
      expect(written.threadId).toBe("thread-1");

      const read = readBacksterosTaskThreadBindings(stateDir);
      expect(read.byTaskId["task-1"]?.displayId).toBe("BDV-1");

      const byRef = findBacksterosTaskThreadBinding(stateDir, { displayId: "bdv-1" });
      expect(byRef?.taskId).toBe("task-1");

      const listed = listBacksterosTaskThreadBindings(stateDir);
      expect(listed).toHaveLength(1);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe("backsteros control helpers", () => {
  it("parses display ids", () => {
    expect(parseBacksterosDisplayId("BDV-33")).toEqual({ projectKey: "BDV", number: 33 });
    expect(parseBacksterosDisplayId("not-a-ref")).toBeNull();
  });

  it("builds a kickoff prompt with task metadata", () => {
    const prompt = buildControlKickoffPrompt({
      task: {
        id: "abc",
        number: 33,
        title: "Control API",
        description: "Ship it",
        status: "in_progress",
        projectId: "p1",
      },
      projectKey: "BDV",
      workingDirectory: "/tmp/dev",
    });
    expect(prompt).toContain("Implement this Backsteros task");
    expect(prompt).toContain("Task ID: BDV-33");
    expect(prompt).toContain("Working directory: /tmp/dev");
  });

  it("treats loopback remotes as allowed", () => {
    assert.equal(isControlLoopbackRemote(Option.none()), true);
    assert.equal(isControlLoopbackRemote(Option.some("127.0.0.1")), true);
    assert.equal(isControlLoopbackRemote(Option.some("::1")), true);
    assert.equal(isControlLoopbackRemote(Option.some("::ffff:127.0.0.1")), true);
    assert.equal(isControlLoopbackRemote(Option.some("192.168.1.10")), false);
  });
});

describe("backsteros control workspace resolve", () => {
  it("prefers workspaceRoot override over BacksterOS cwd", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: "/override",
        localWorkingDirectory: "/from-backsteros",
      }),
    ).toEqual({ workspaceRoot: "/override" });
  });

  it("uses BacksterOS localWorkingDirectory when override is omitted", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "  /Users/me/dev  ",
      }),
    ).toEqual({ workspaceRoot: "/Users/me/dev" });
  });

  it("returns a clear no_workspace JSON error when cwd is missing", () => {
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: null,
      }),
    ).toEqual({
      error: {
        status: 409,
        error: "BacksterOS project has no localWorkingDirectory and workspaceRoot was not provided",
        code: "no_workspace",
      },
    });
    expect(
      resolveControlWorkspaceRoot({
        workspaceRootOverride: null,
        localWorkingDirectory: "   ",
      }),
    ).toMatchObject({ error: { code: "no_workspace", status: 409 } });
  });

  it("matches a linked T3 project by normalized workspace path", () => {
    const projects = [
      { id: "other", workspaceRoot: "/Users/me/other" },
      { id: "dev", workspaceRoot: "/Users/me/dev" },
    ];
    expect(
      matchControlT3Project(projects, {
        workspaceRoot: "/Users/me/dev/",
        projectIdOverride: null,
      }),
    ).toEqual({ kind: "found", project: projects[1] });
  });

  it("reports unlinked when no T3 project matches the cwd", () => {
    expect(
      matchControlT3Project([{ id: "other", workspaceRoot: "/Users/me/other" }], {
        workspaceRoot: "/Users/me/dev",
        projectIdOverride: null,
      }),
    ).toEqual({ kind: "unlinked" });
  });

  it("honors projectId override and missing-id errors", () => {
    const projects = [{ id: "dev", workspaceRoot: "/Users/me/dev" }];
    expect(
      matchControlT3Project(projects, {
        workspaceRoot: "/ignored",
        projectIdOverride: "dev",
      }),
    ).toEqual({ kind: "found", project: projects[0] });
    expect(
      matchControlT3Project(projects, {
        workspaceRoot: "/Users/me/dev",
        projectIdOverride: "missing",
      }),
    ).toEqual({ kind: "missing_id", projectId: "missing" });
  });
});
