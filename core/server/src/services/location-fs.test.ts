import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  LocationFsError,
  buildRemoteLocationFsScript,
  createLocationFsFolder,
  listLocationFs,
  normalizeAbsolutePath,
  resolveLocationFsBase,
  resolveLocationFsSshHost,
} from "./location-fs.js";

describe("location-fs", () => {
  it("resolves local base under BacksterOS/Projects by default", () => {
    assert.equal(
      resolveLocationFsBase("local", {
        env: {},
        homedir: () => "/Users/me",
      }),
      path.resolve("/Users/me/BacksterOS/Projects"),
    );
  });

  it("honors env overrides for bases and SSH hosts", () => {
    const env = {
      BACKSTEROS_LOCAL_FS_ROOT: "/tmp/local-projects",
      BACKSTEROS_DEVELOPMENT_FS_ROOT: "/data/vault/Projects",
      BACKSTEROS_PRODUCTION_FS_ROOT: "/data/vault/Projects",
      BACKSTEROS_DEVELOPMENT_SSH_HOST: "dev-alias",
      BACKSTEROS_PRODUCTION_SSH_HOST: "prod-alias",
    };
    assert.equal(
      resolveLocationFsBase("local", { env }),
      path.resolve("/tmp/local-projects"),
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

  it("lists only directories under the local jail and reports writable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "location-fs-"));
    await mkdir(path.join(root, "alpha"));
    await mkdir(path.join(root, "beta"));
    await writeFile(path.join(root, "readme.txt"), "x");
    await mkdir(path.join(root, ".hidden"));

    const listed = await listLocationFs("local", root, {
      env: { BACKSTEROS_LOCAL_FS_ROOT: root },
    });
    assert.equal(listed.exists, true);
    assert.equal(listed.writable, true);
    assert.equal(listed.base, await import("node:fs/promises").then((fs) => fs.realpath(root)));
    assert.deepEqual(
      listed.entries.map((entry) => entry.name).sort(),
      ["alpha", "beta"],
    );
  });

  it("refuses to browse outside the local base", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "location-fs-"));
    await assert.rejects(
      () =>
        listLocationFs("local", "/tmp", {
          env: { BACKSTEROS_LOCAL_FS_ROOT: root },
        }),
      (error: unknown) =>
        error instanceof LocationFsError &&
        error.code === "fs_path_outside_root",
    );
  });

  it("creates a folder under the local base", async () => {
    const { realpath } = await import("node:fs/promises");
    const root = await mkdtemp(path.join(tmpdir(), "location-fs-"));
    const created = await createLocationFsFolder("local", root, "new-app", {
      env: { BACKSTEROS_LOCAL_FS_ROOT: root },
    });
    assert.equal(created.path, path.join(await realpath(root), "new-app"));
    const listed = await listLocationFs("local", root, {
      env: { BACKSTEROS_LOCAL_FS_ROOT: root },
    });
    assert.ok(listed.entries.some((entry) => entry.name === "new-app"));
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
