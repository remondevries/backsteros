import assert from "node:assert/strict";
import { test } from "node:test";

import {
  sectionTabsOwnDigitShortcuts,
} from "./letter-pdf-attachment-shortcut.js";

test("project letter routes yield digit keys to section tabs", () => {
  assert.equal(sectionTabsOwnDigitShortcuts("/projects/demo/letters"), true);
  assert.equal(
    sectionTabsOwnDigitShortcuts("/projects/demo/letters/abc"),
    true,
  );
});

test("global letter detail keeps digit keys for PDF attachments", () => {
  assert.equal(sectionTabsOwnDigitShortcuts("/letters"), false);
  assert.equal(sectionTabsOwnDigitShortcuts("/letters/abc"), false);
});
