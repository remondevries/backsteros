import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectTypeHasRegistrarOwnedDates } from "./project-type.js";

describe("projectTypeHasRegistrarOwnedDates", () => {
  it("is true only for domain projects", () => {
    assert.equal(projectTypeHasRegistrarOwnedDates("domeinname"), true);
    assert.equal(projectTypeHasRegistrarOwnedDates("codebase"), false);
    assert.equal(projectTypeHasRegistrarOwnedDates("general"), false);
    assert.equal(projectTypeHasRegistrarOwnedDates(null), false);
    assert.equal(projectTypeHasRegistrarOwnedDates(undefined), false);
  });
});
