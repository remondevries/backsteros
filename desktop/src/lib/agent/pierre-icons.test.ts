import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasSpecificPierreIconForFileName,
  resolvePierreIconForEntry,
  syntheticFileNameForLanguageId,
  T3_PIERRE_ICONS,
} from "../../../packages/ui/src/pierre-icons.ts";

describe("pierre file icons", () => {
  it("uses Pierre exact filename and complete-set extension mappings", () => {
    assert.equal(resolvePierreIconForEntry("Dockerfile", "file")?.token, "docker");
    assert.equal(resolvePierreIconForEntry("src/Button.tsx", "file")?.token, "react");
    assert.equal(resolvePierreIconForEntry("vite.config.ts", "file")?.token, "vite");
  });

  it("extends Pierre with T3-specific exact filename icons", () => {
    assert.equal(
      resolvePierreIconForEntry("package.json", "file")?.name,
      "t3-file-icon-package-json",
    );
    assert.equal(
      resolvePierreIconForEntry("config/tsconfig.json", "file")?.name,
      "t3-file-icon-tsconfig",
    );
    assert.equal(resolvePierreIconForEntry("AGENTS.md", "file")?.name, "t3-file-icon-agents");
    assert.equal(resolvePierreIconForEntry("CLAUDE.md", "file")?.name, "t3-file-icon-claude");
    assert.equal(resolvePierreIconForEntry("README.md", "file")?.name, "t3-file-icon-readme");
    assert.equal(
      resolvePierreIconForEntry("pnpm-lock.yaml", "file")?.name,
      "t3-file-icon-pnpm",
    );
  });

  it("ships every custom icon referenced by the extended resolver", () => {
    const customIconNames = new Set(Object.values(T3_PIERRE_ICONS.byFileName));
    for (const iconName of customIconNames) {
      assert.ok(T3_PIERRE_ICONS.spriteSheet.includes(`id="${iconName}"`));
    }
  });

  it("uses the Pierre default icon for unknown file types", () => {
    assert.equal(
      resolvePierreIconForEntry("artifact.unknown-ext", "file")?.token,
      "default",
    );
    assert.equal(hasSpecificPierreIconForFileName("artifact.unknown-ext"), false);
  });

  it("leaves directory rendering to the shared folder fallback", () => {
    assert.equal(
      resolvePierreIconForEntry("packages/client-runtime", "directory"),
      null,
    );
  });

  it("normalizes common markdown fence language aliases", () => {
    assert.equal(syntheticFileNameForLanguageId("typescript"), "file.ts");
    assert.equal(syntheticFileNameForLanguageId("shellscript"), "file.sh");
    assert.equal(syntheticFileNameForLanguageId("python"), "file.py");
  });
});
