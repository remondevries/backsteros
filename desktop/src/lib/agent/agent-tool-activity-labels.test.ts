import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isGenericToolTitle,
  toolActivityHeading,
  toolKindVerb,
} from "./t3-port/work-entry-labels.ts";

test("generic Tool title maps to kind verbs", () => {
  assert.equal(isGenericToolTitle("Tool"), true);
  assert.equal(isGenericToolTitle("tool call"), true);
  assert.equal(isGenericToolTitle("Read STRUCTURE.md"), false);
  assert.equal(
    toolActivityHeading({ title: "Tool", toolKind: "search" }),
    "Grepped",
  );
  assert.equal(
    toolActivityHeading({ title: "Tool", toolKind: "read" }),
    "Read",
  );
  assert.equal(
    toolActivityHeading({ title: "Reading config", toolKind: "read" }),
    "Reading config",
  );
  assert.equal(toolKindVerb("search"), "Grepped");
  assert.equal(toolKindVerb("edit"), "Edited");
});
