import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listControlEnvironmentsPublic,
  readControlEnvironments,
  resolveControlEnvironmentTarget,
  writeControlEnvironments,
} from "./control-environments.ts";

describe("control-environments", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempStateDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "control-environments-"));
    dirs.push(dir);
    return dir;
  }

  it("defaults to local when environmentId is omitted", () => {
    const stateDir = tempStateDir();
    const resolved = resolveControlEnvironmentTarget({
      stateDir,
      localEnvironmentId: "local-1",
      localLabel: "MacBook",
    });
    expect(resolved).toEqual({
      ok: true,
      environment: { kind: "local", environmentId: "local-1", label: "MacBook" },
    });
  });

  it("resolves a remote by label case-insensitively", () => {
    const stateDir = tempStateDir();
    writeControlEnvironments(stateDir, [
      {
        environmentId: "remote-1",
        label: "development",
        httpBaseUrl: "http://100.126.31.97:3773",
        accessToken: "tok",
      },
    ]);
    const resolved = resolveControlEnvironmentTarget({
      stateDir,
      localEnvironmentId: "local-1",
      localLabel: "MacBook",
      environmentLabel: "Development",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.environment).toMatchObject({
      kind: "remote",
      environmentId: "remote-1",
      httpBaseUrl: "http://100.126.31.97:3773",
      accessToken: "tok",
    });
  });

  it("lists local plus remotes without returning tokens", () => {
    const stateDir = tempStateDir();
    writeControlEnvironments(stateDir, [
      {
        environmentId: "remote-1",
        label: "development",
        httpBaseUrl: "http://100.126.31.97:3773/",
        accessToken: "secret",
      },
    ]);
    const listed = listControlEnvironmentsPublic({
      stateDir,
      localEnvironmentId: "local-1",
      localLabel: "MacBook",
      localHttpBaseUrl: "http://127.0.0.1:3773",
    });
    expect(listed).toEqual([
      {
        environmentId: "local-1",
        label: "MacBook",
        httpBaseUrl: "http://127.0.0.1:3773",
        local: true,
        hasAccessToken: false,
      },
      {
        environmentId: "remote-1",
        label: "development",
        httpBaseUrl: "http://100.126.31.97:3773",
        local: false,
        hasAccessToken: true,
      },
    ]);
    expect(readControlEnvironments(stateDir)[0]?.accessToken).toBe("secret");
  });

  it("rejects unknown environment ids", () => {
    const stateDir = tempStateDir();
    const resolved = resolveControlEnvironmentTarget({
      stateDir,
      localEnvironmentId: "local-1",
      localLabel: "MacBook",
      environmentId: "missing",
    });
    expect(resolved).toMatchObject({ ok: false, code: "environment_not_found" });
  });
});
