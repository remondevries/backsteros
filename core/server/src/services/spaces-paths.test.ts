import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expectedChildSpacesPath,
  isMisplacedPortalUnderSecondBrain,
  normalizeSpacesPath,
  rewritePathUnderPrefix,
  spacesPathLeaf,
  resolveSpacesCategoryIdFromPath,
} from "./spaces-paths.js";

describe("spaces-paths", () => {
  it("normalizes and extracts leaf segments", () => {
    assert.equal(normalizeSpacesPath("/support/portal/"), "support/portal");
    assert.equal(spacesPathLeaf("support/portal/email"), "email");
    assert.equal(spacesPathLeaf("portal", "Portal"), "portal");
    assert.equal(spacesPathLeaf("", "Idea's"), "idea-s");
  });

  it("resolves category from path prefix", () => {
    assert.equal(resolveSpacesCategoryIdFromPath("support"), "support");
    assert.equal(
      resolveSpacesCategoryIdFromPath("support/portal/email.md"),
      "support",
    );
    assert.equal(
      resolveSpacesCategoryIdFromPath("knowledge-base/second-brain"),
      "knowledge-base",
    );
    assert.equal(resolveSpacesCategoryIdFromPath("portal"), null);
  });

  it("builds expected child paths", () => {
    assert.equal(
      expectedChildSpacesPath("support", "portal"),
      "support/portal",
    );
    assert.equal(
      expectedChildSpacesPath("knowledge-base/second-brain", "linear"),
      "knowledge-base/second-brain/linear",
    );
    assert.equal(expectedChildSpacesPath(null, "support"), "support");
  });

  it("rewrites descendant paths under a moved prefix", () => {
    assert.equal(
      rewritePathUnderPrefix("portal", "portal", "support/portal"),
      "support/portal",
    );
    assert.equal(
      rewritePathUnderPrefix("portal/email", "portal", "support/portal"),
      "support/portal/email",
    );
    assert.equal(
      rewritePathUnderPrefix("other", "portal", "support/portal"),
      "other",
    );
  });

  it("detects Portal misplaced under Second brain", () => {
    assert.equal(
      isMisplacedPortalUnderSecondBrain({
        title: "Portal",
        path: "portal",
        parentPath: "knowledge-base/second-brain",
      }),
      true,
    );
    assert.equal(
      isMisplacedPortalUnderSecondBrain({
        title: "Portal",
        path: "support/portal",
        parentPath: "support",
      }),
      false,
    );
  });
});
