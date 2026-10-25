import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getContactsGroupHref,
  parseCrmGroupId,
  resolveCrmGroupRedirect,
} from "./contact-group-filter.js";

test("parseCrmGroupId reads a trimmed crmGroup param", () => {
  assert.equal(parseCrmGroupId("?crmGroup=%20g1%20"), "g1");
  assert.equal(parseCrmGroupId("crmGroup="), null);
  assert.equal(parseCrmGroupId(""), null);
});

test("resolveCrmGroupRedirect only redirects to a different resolved id", () => {
  assert.equal(resolveCrmGroupRedirect("alias", "canonical"), "canonical");
  assert.equal(resolveCrmGroupRedirect("g1", "g1"), null);
  assert.equal(resolveCrmGroupRedirect(null, "g1"), null);
  assert.equal(resolveCrmGroupRedirect("missing", null), null);
});

test("getContactsGroupHref adds or omits the group filter", () => {
  assert.equal(getContactsGroupHref("g1"), "/contacts?crmGroup=g1");
  assert.equal(getContactsGroupHref(null), "/contacts");
});
