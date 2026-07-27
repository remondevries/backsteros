import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getProjectStatusHeaderGradient,
  getTaskStatusHeaderGradient,
  parseCssHexColor,
} from "./status-header-gradient.ts";

describe("parseCssHexColor", () => {
  it("parses 8-digit hex with alpha", () => {
    const parsed = parseCssHexColor("#ee7a4710");
    assert.equal(parsed.color, "#ee7a47");
    assert.ok(Math.abs(parsed.opacity - 16 / 255) < 0.001);
  });

  it("parses 6-digit hex as opaque", () => {
    assert.deepEqual(parseCssHexColor("#bfc2c7"), {
      color: "#bfc2c7",
      opacity: 1,
    });
  });
});

describe("status header gradients", () => {
  it("maps task triage to warm tint", () => {
    assert.equal(getTaskStatusHeaderGradient("triage").from, "#ee7a4710");
  });

  it("maps project active to in-progress tint", () => {
    assert.equal(
      getProjectStatusHeaderGradient("active").from,
      getTaskStatusHeaderGradient("in_progress").from,
    );
  });
});
