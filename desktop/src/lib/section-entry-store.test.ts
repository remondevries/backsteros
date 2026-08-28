import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  peekSectionEntryHref,
  rememberSectionEntryFromNav,
  rememberSectionEntryHrefs,
} from "./section-entry-store.ts";

afterEach(() => {
  rememberSectionEntryHrefs({
    inbox: null,
    contacts: null,
    organizations: null,
    letters: null,
    knowledge: null,
  });
});

test("rememberSectionEntryFromNav does not overwrite first-item seeds", () => {
  rememberSectionEntryHrefs({ inbox: "/inbox/in-1" });
  rememberSectionEntryFromNav("/inbox/in-99");
  rememberSectionEntryFromNav("/email/box/msg?list=inbox");
  rememberSectionEntryFromNav("/contacts/8");
  assert.equal(peekSectionEntryHref("inbox"), "/inbox/in-1");
  assert.equal(peekSectionEntryHref("contacts"), null);
});
