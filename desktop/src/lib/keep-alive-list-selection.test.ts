import assert from "node:assert/strict";
import { test } from "node:test";

import { panePathnameWithFirstItem } from "./keep-alive-list-selection.ts";

test("selects the first list href only when the pane is on the section root", () => {
  assert.equal(
    panePathnameWithFirstItem("/inbox", "/inbox/in-1", false),
    "/inbox/in-1",
  );
  assert.equal(
    panePathnameWithFirstItem("/inbox/in-9", "/inbox/in-1", true),
    "/inbox/in-9",
  );
  assert.equal(panePathnameWithFirstItem("/knowledge", null, false), "/knowledge");
});
