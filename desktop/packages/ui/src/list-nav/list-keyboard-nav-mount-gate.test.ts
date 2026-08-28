import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ListKeyboardNavMountGate,
  useListKeyboardNavMountGate,
} from "./list-keyboard-nav-mount-gate.js";

function GateProbe() {
  const active = useListKeyboardNavMountGate();
  return createElement("span", null, active ? "on" : "off");
}

describe("ListKeyboardNavMountGate", () => {
  it("defaults to active outside a gate", () => {
    assert.equal(renderToStaticMarkup(createElement(GateProbe)), "<span>on</span>");
  });

  it("propagates inactive to nested consumers", () => {
    assert.equal(
      renderToStaticMarkup(
        createElement(
          ListKeyboardNavMountGate,
          { active: false },
          createElement(GateProbe),
        ),
      ),
      "<span>off</span>",
    );
  });
});
