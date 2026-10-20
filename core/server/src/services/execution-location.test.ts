import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executionLocationEnvironmentLabel,
  resolveExecutionWorkspacePath,
} from "./execution-location.js";

describe("execution-location", () => {
  const project = {
    developmentLocation: "/home/deploy/code/app",
    productionLocation: "/var/www/app",
    localWorkingDirectory: "/Users/me/Vault/app/Codebase",
  };

  it("resolves each override path", () => {
    assert.equal(
      resolveExecutionWorkspacePath(project, "development"),
      "/home/deploy/code/app",
    );
    assert.equal(
      resolveExecutionWorkspacePath(project, "production"),
      "/var/www/app",
    );
    assert.equal(
      resolveExecutionWorkspacePath(project, "local"),
      "/Users/me/Vault/app/Codebase",
    );
  });

  it("uses localWorkingDirectory for local and default (ignores deprecated localLocation)", () => {
    assert.equal(
      resolveExecutionWorkspacePath(
        {
          ...project,
          localLocation: "/Users/me/Projects/app",
        },
        "local",
      ),
      "/Users/me/Vault/app/Codebase",
    );
    assert.equal(
      resolveExecutionWorkspacePath(project, null),
      "/Users/me/Vault/app/Codebase",
    );
  });

  it("maps development/production to environment labels", () => {
    assert.equal(executionLocationEnvironmentLabel("development"), "development");
    assert.equal(executionLocationEnvironmentLabel("production"), "production");
    assert.equal(executionLocationEnvironmentLabel("local"), null);
    assert.equal(executionLocationEnvironmentLabel(null), null);
  });
});
