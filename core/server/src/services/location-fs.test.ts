import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  LocationFsError,
  buildRemoteLocationFsScript,
  createLocationFsFolder,
  defaultLocalCodebasePath,
  listLocationFs,
  normalizeAbsolutePath,
  resolveLocalProjectBase,
  resolveLocationFsBase,
  resolveLocationFsSshHost,
} from "./location-fs.js";

describe("location-fs", () => {
  it("resolves local jail to vault Projects/{key}", () => {
    assert.equal(
      resolveLocalProjectBase("OS", {
        env: {},
        vaultRoot: "/Users/me/BacksterOS",
      }),
      path.resolve("/Users/me/BacksterOS/Projects/OS"),
    );
    assert.equal(
      defaultLocalCodebasePath("/Users/me/BacksterOS/Projects/OS"),
      path.join("/Users/me/BacksterOS/Projects/OS", "Codebase"),
    );
  });

  it("honors env overrides for bases and SSH hosts", () => {
    const env = {
      BACKSTEROS_LOCAL_FS_ROOT: "/tmp/vault-root",
      BACKSTEROS_DEVELOPMENT_FS_ROOT: "/data/vault/Projects",
      BACKSTEROS_PRODUCTION_FS_ROOT: "/data/vault/Projects",
      BACKSTEROS_DEVELOPMENT_SSH_HOST: "dev-alias",
      BACKSTEROS_PRODUCTION_SSH_HOST: "prod-alias",
    };
    assert.equal(
      resolveLocationFsBase("local", { env }, { projectKey: "OS" }),
      path.resolve("/tmp/vault-root/Projects/OS"),
    );
    assert.equal(
      resolveLocationFsBase("development", { env }),
      "/data/vault/Projects",
    );
    assert.equal(
      resolveLocationFsBase("production", { env }),
      "/data/vault/Projects",
    );
    assert.equal(resolveLocationFsSshHost("development", { env }), "dev-alias");
    assert.equal(resolveLocationFsSshHost("production", { env }), "prod-alias");
  });

  it("rejects relative and .. paths", () => {
    assert.throws(
      () => normalizeAbsolutePath("relative"),
      (error: unknown) =>
        error instanceof LocationFsError && error.code === "fs_path_invalid",
    );
    assert.throws(
      () => normalizeAbsolutePath("/a/../b"),
      (error: unknown) =>
        error instanceof LocationFsError &&
        error.code === "fs_path_outside_root",
    );
  });

  it("defaults local listing into Codebase and allows Up to project root only", async () => {
    const { realpath } = await import("node:fs/promises");
    const vault = await mkdtemp(path.join(tmpdir(), "location-fs-vault-"));
    const projectRoot = path.join(vault, "Projects", "OS");
    await mkdir(path.join(projectRoot, "Codebase"), { recursive: true });
    await mkdir(path.join(projectRoot, "Documents"), { recursive: true });
    await writeFile(path.join(projectRoot, "readme.txt"), "x");

    const listed = await listLocationFs(
      "local",
      undefined,
      { vaultRoot: vault },
      { projectKey: "OS" },
    );
    const baseReal = await realpath(projectRoot);
    assert.equal(listed.base, baseReal);
    assert.equal(listed.path, path.join(baseReal, "Codebase"));
    assert.equal(listed.exists, true);

    const atRoot = await listLocationFs(
      "local",
      listed.base,
      { vaultRoot: vault },
      { projectKey: "OS" },
    );
    assert.deepEqual(
      atRoot.entries.map((entry) => entry.name).sort(),
      ["Codebase", "Documents"],
    );

    await assert.rejects(
      () =>
        listLocationFs(
          "local",
          path.dirname(projectRoot),
          { vaultRoot: vault },
          { projectKey: "OS" },
        ),
      (error: unknown) =>
        error instanceof LocationFsError &&
        error.code === "fs_path_outside_root",
    );
  });

  it("creates a folder under the local project jail", async () => {
    const { realpath } = await import("node:fs/promises");
    const vault = await mkdtemp(path.join(tmpdir(), "location-fs-vault-"));
    const projectRoot = path.join(vault, "Projects", "OS");
    await mkdir(path.join(projectRoot, "Codebase"), { recursive: true });

    const created = await createLocationFsFolder(
      "local",
      path.join(projectRoot, "Codebase"),
      "worktrees",
      { vaultRoot: vault },
      { projectKey: "OS" },
    );
    assert.equal(
      created.path,
      path.join(await realpath(projectRoot), "Codebase", "worktrees"),
    );
  });

  it("lists over SSH using the remote helper script", async () => {
    const script = buildRemoteLocationFsScript();
    assert.match(script, /ensure_base/);
    assert.match(script, /fs_path_outside_root/);

    const payload = JSON.stringify({
      ok: true,
      base: "/home/deploy/Projects",
      path: "/home/deploy/Projects",
      exists: true,
      writable: true,
      entries: [
        {
          name: "OS",
          path: "/home/deploy/Projects/OS",
          kind: "directory",
        },
      ],
    });

    const listed = await listLocationFs("development", undefined, {
      env: {
        BACKSTEROS_DEVELOPMENT_FS_ROOT: "/home/deploy/Projects",
        BACKSTEROS_DEVELOPMENT_SSH_HOST: "development",
      },
      exec: async (file, args) => {
        assert.equal(file, "ssh");
        assert.ok(args.includes("development"));
        assert.ok(args.some((arg) => String(arg).includes("python3")));
        return { stdout: payload, stderr: "" };
      },
    });
    assert.equal(listed.target, "development");
    assert.equal(listed.path, "/home/deploy/Projects");
    assert.equal(listed.entries.length, 1);
    assert.equal(listed.entries[0]?.name, "OS");
  });

  it("maps remote helper errors to LocationFsError", async () => {
    await assert.rejects(
      () =>
        listLocationFs("production", "/etc", {
          env: {
            BACKSTEROS_PRODUCTION_FS_ROOT: "/home/deploy/Projects",
          },
          exec: async () => ({
            stdout: JSON.stringify({
              ok: false,
              code: "fs_path_outside_root",
              message: "Path is outside the allowed base",
              status: 403,
            }),
            stderr: "",
          }),
        }),
      (error: unknown) =>
        error instanceof LocationFsError &&
        error.code === "fs_path_outside_root" &&
        error.status === 403,
    );
  });
});
