import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bdv-project-secrets-"));

vi.spyOn(os, "homedir").mockReturnValue(tmpHome);

const {
  assertSafeEnvFileName,
  assertSafeProjectId,
  ensureProjectSecretsFolder,
  listProjectSecrets,
  projectSecretsFolderPath,
  readProjectSecretFile,
  writeProjectSecretFile,
} = await import("./project-secrets.ts");

describe("project-secrets", () => {
  beforeEach(() => {
    fs.rmSync(path.join(tmpHome, ".config"), { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(path.join(tmpHome, ".config"), { recursive: true, force: true });
  });

  it("rejects unsafe project ids and file names", () => {
    expect(() => assertSafeProjectId("../x")).toThrow(/Invalid projectId/);
    expect(() => assertSafeProjectId("a/b")).toThrow(/Invalid projectId/);
    expect(() => assertSafeEnvFileName("../.env")).toThrow(/Invalid fileName/);
    expect(() => assertSafeEnvFileName("infisical.json")).toThrow(/not an editable/);
    expect(assertSafeEnvFileName(".env")).toBe(".env");
    expect(assertSafeEnvFileName("staging.env")).toBe("staging.env");
  });

  it("ensures folder + empty .env with 0600", () => {
    const projectId = "IzyZOLM9ozJEUaWdSy0T0";
    const folder = ensureProjectSecretsFolder(projectId);
    expect(folder.folderPath).toBe(projectSecretsFolderPath(projectId));
    expect(folder.files.map((f) => f.name)).toEqual([".env"]);
    expect(folder.infisicalConfigured).toBe(false);

    const envPath = path.join(folder.folderPath, ".env");
    expect(fs.readFileSync(envPath, "utf8")).toBe("");
    const mode = fs.statSync(envPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("writes content and lists files", () => {
    const projectId = "projABC123";
    writeProjectSecretFile({
      projectId,
      content: "FOO=bar\n",
    });
    writeProjectSecretFile({
      projectId,
      fileName: "staging.env",
      content: "FOO=staging\n",
    });

    const listed = listProjectSecrets(projectId);
    expect(listed.files.map((f) => f.name)).toEqual([".env", "staging.env"]);

    const read = readProjectSecretFile(projectId, ".env");
    expect(read.content).toBe("FOO=bar\n");
  });

  it("reads infisical.json mapping without exposing it as an env file", () => {
    const projectId = "mappedProject1";
    const folder = ensureProjectSecretsFolder(projectId);
    fs.writeFileSync(
      path.join(folder.folderPath, "infisical.json"),
      JSON.stringify({
        infisicalProjectId: "ff2aefbd-1f2e-4bad-996d-6b282d49d05c",
        path: "/BDV",
        env: "dev",
      }),
      "utf8",
    );

    const listed = listProjectSecrets(projectId);
    expect(listed.infisicalConfigured).toBe(true);
    expect(listed.infisical).toEqual({
      infisicalProjectId: "ff2aefbd-1f2e-4bad-996d-6b282d49d05c",
      path: "/BDV",
      env: "dev",
    });
    expect(listed.files.map((f) => f.name)).toEqual([".env"]);
  });
});
