import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirror of normalizePathname / isSectionHomePath in use-escape-back-navigation
 * (kept in sync for unit coverage without React Native imports).
 */
function normalizePathname(pathname: string): string {
  const stripped = pathname
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment))
    .join("/");
  return stripped ? `/${stripped}` : "/";
}

function isSectionHomePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname).replace(/\/$/, "") || "/";
  return (
    normalized === "/" ||
    normalized === "/inbox" ||
    normalized === "/journal" ||
    normalized === "/tasks" ||
    normalized === "/projects" ||
    normalized === "/areas" ||
    normalized === "/letters" ||
    normalized === "/knowledge" ||
    normalized === "/contacts" ||
    normalized === "/organizations" ||
    normalized === "/compose" ||
    normalized === "/development"
  );
}

describe("escape-back section homes", () => {
  it("strips expo route groups", () => {
    assert.equal(normalizePathname("/(app)/tasks"), "/tasks");
    assert.equal(normalizePathname("/(app)/projects/CI"), "/projects/CI");
    assert.equal(normalizePathname("/"), "/");
  });

  it("treats tab roots as homes", () => {
    assert.equal(isSectionHomePath("/(app)/tasks"), true);
    assert.equal(isSectionHomePath("/projects"), true);
    assert.equal(isSectionHomePath("/task/abc"), false);
    assert.equal(isSectionHomePath("/(app)/projects/CI"), false);
  });
});
