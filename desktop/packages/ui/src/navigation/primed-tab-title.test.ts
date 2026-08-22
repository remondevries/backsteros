import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  clearPrimedTabTitles,
  getPrimedTabTitle,
  primeTabTitle,
} from "../../dist/navigation/primed-tab-title.js";
import {
  createDefaultTabsState,
  createProductTab,
  getTabTitleForHref,
  syncActiveTabToPath,
} from "../../dist/navigation/tabs.js";

describe("primed tab titles", () => {
  test("getTabTitleForHref prefers a primed entity name", () => {
    clearPrimedTabTitles();
    primeTabTitle("/projects/bos", "Backsteros");
    assert.equal(getTabTitleForHref("/projects/bos"), "Backsteros");
    assert.equal(getPrimedTabTitle("/projects/bos/?x=1"), "Backsteros");
  });

  test("project task routes fall back to Task, not Project", () => {
    clearPrimedTabTitles();
    assert.equal(getTabTitleForHref("/projects/bos/tasks/bos-1"), "Task");
    assert.equal(
      getTabTitleForHref(
        "/projects/bos/tasks/01234567-89ab-4def-8123-456789abcdef",
      ),
      "Task",
    );
  });

  test("syncActiveTabToPath uses primed titles when navigating", () => {
    clearPrimedTabTitles();
    primeTabTitle("/projects/bos", "Backsteros");
    const state = createDefaultTabsState("/projects");
    const next = syncActiveTabToPath(state, "/projects/bos");
    assert.equal(next.tabs[0]?.href, "/projects/bos");
    assert.equal(next.tabs[0]?.title, "Backsteros");
  });

  test("syncActiveTabToPath upgrades a generic title when primed later", () => {
    clearPrimedTabTitles();
    const tab = createProductTab("/projects/bos", "Projects");
    const state = { tabs: [tab], activeTabId: tab.id };
    primeTabTitle("/projects/bos", "Backsteros");
    const next = syncActiveTabToPath(state, "/projects/bos");
    assert.equal(next.tabs[0]?.title, "Backsteros");
  });
});
