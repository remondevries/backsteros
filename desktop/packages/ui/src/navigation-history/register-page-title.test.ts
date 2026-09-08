import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shouldApplyPageTitleToChrome } from "./register-page-title.js";
import {
  clearPrimedTabTitles,
  getPrimedTabTitle,
  primeTabTitle,
} from "../navigation/primed-tab-title.js";
import { getTabTitleForHref } from "../navigation/tabs.js";

describe("shouldApplyPageTitleToChrome", () => {
  test("blocks inactive keep-alive registrars", () => {
    assert.equal(
      shouldApplyPageTitleToChrome({
        chromePathname: "/inbox",
        titleHref: "/projects/bos",
        active: false,
      }),
      false,
    );
  });

  test("blocks frozen project titles from labeling a different chrome route", () => {
    assert.equal(
      shouldApplyPageTitleToChrome({
        chromePathname: "/inbox",
        titleHref: "/projects/bos",
        active: true,
      }),
      false,
    );
  });

  test("allows titles when chrome still matches the page href", () => {
    assert.equal(
      shouldApplyPageTitleToChrome({
        chromePathname: "/projects/bos/documents",
        titleHref: "/projects/bos/documents",
        active: true,
      }),
      true,
    );
  });

  test("defaults title href to chrome pathname when omitted", () => {
    assert.equal(
      shouldApplyPageTitleToChrome({
        chromePathname: "/calendar",
        active: true,
      }),
      true,
    );
  });
});

describe("primed title isolation", () => {
  test("project primes must not leak onto unrelated hrefs", () => {
    clearPrimedTabTitles();
    primeTabTitle("/projects/bos", "Backsteros");
    assert.equal(getPrimedTabTitle("/inbox"), null);
    assert.equal(getTabTitleForHref("/inbox"), "Inbox");
    assert.equal(getTabTitleForHref("/projects/bos"), "Backsteros");
  });
});
