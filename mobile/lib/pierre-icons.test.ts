import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPierreIconSvgXml,
  colorForPierreToken,
  resolvePierreIconForEntry,
} from "./pierre-icons";

describe("resolvePierreIconForEntry", () => {
  it("resolves language tokens like desktop Pierre", () => {
    assert.equal(
      resolvePierreIconForEntry("src/App.tsx", "file")?.token,
      "react",
    );
    assert.equal(
      resolvePierreIconForEntry("lib/main.ts", "file")?.token,
      "typescript",
    );
    assert.equal(
      resolvePierreIconForEntry("index.js", "file")?.token,
      "javascript",
    );
    assert.equal(
      resolvePierreIconForEntry("Dockerfile", "file")?.token,
      "docker",
    );
  });

  it("applies T3 exact-name overrides", () => {
    assert.equal(
      resolvePierreIconForEntry("package.json", "file")?.name,
      "t3-file-icon-package-json",
    );
    assert.equal(
      resolvePierreIconForEntry("AGENTS.md", "file")?.name,
      "t3-file-icon-agents",
    );
    assert.equal(
      resolvePierreIconForEntry("pnpm-lock.yaml", "file")?.name,
      "t3-file-icon-pnpm",
    );
  });

  it("returns null for directories", () => {
    assert.equal(resolvePierreIconForEntry("src", "directory"), null);
  });
});

describe("buildPierreIconSvgXml", () => {
  it("embeds resolved SVG for a known icon", () => {
    const resolved = resolvePierreIconForEntry("main.ts", "file");
    assert.ok(resolved);
    const color = colorForPierreToken(resolved.token);
    const xml = buildPierreIconSvgXml(resolved.name, color, 14);
    assert.ok(xml?.includes('viewBox="0 0 16 16"'));
    assert.ok(xml?.includes(color));
  });
});
