import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { createProductTab } from "@backsteros/ui/shell";

import {
  getProductTabUiState,
  patchProductTabInboxUi,
  patchProductTabPageScroll,
  resetProductTabUiStateForTests,
} from "./product-tab-ui-state.js";
import { resetKeepAliveForTests } from "./shell-warm-keep-alive.js";

describe("per-tab scroll slots", () => {
  afterEach(() => {
    resetProductTabUiStateForTests();
    resetKeepAliveForTests();
  });

  test("page and panel scrolltops stay isolated across tabs", () => {
    const tabA = createProductTab("/inbox/a");
    const tabB = createProductTab("/inbox/b");
    patchProductTabPageScroll(tabA.id, 120);
    patchProductTabInboxUi(tabA.id, { panelScrollTop: 40 });
    patchProductTabPageScroll(tabB.id, 8);
    patchProductTabInboxUi(tabB.id, { panelScrollTop: 90 });

    assert.equal(getProductTabUiState(tabA.id).pageScrollTop, 120);
    assert.equal(getProductTabUiState(tabA.id).inbox.panelScrollTop, 40);
    assert.equal(getProductTabUiState(tabB.id).pageScrollTop, 8);
    assert.equal(getProductTabUiState(tabB.id).inbox.panelScrollTop, 90);
  });
});
