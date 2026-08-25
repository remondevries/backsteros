import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enqueueMoneybirdRequest } from "./moneybird-request-gate.js";

describe("enqueueMoneybirdRequest", () => {
  it("runs requests one at a time", async () => {
    const order: number[] = [];
    const first = enqueueMoneybirdRequest(async () => {
      order.push(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(2);
    });
    const second = enqueueMoneybirdRequest(async () => {
      order.push(3);
    });
    await Promise.all([first, second]);
    assert.deepEqual(order, [1, 2, 3]);
  });
});
