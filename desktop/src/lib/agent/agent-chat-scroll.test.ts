import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createShowDebouncer } from "./agent-chat-scroll.ts";

describe("agent chat scroll helpers", () => {
  it("createShowDebouncer fires once and cancel drops a pending show", async () => {
    let fires = 0;
    const debouncer = createShowDebouncer(() => {
      fires += 1;
    }, 20);
    debouncer.maybeExecute();
    debouncer.maybeExecute();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fires, 1);

    fires = 0;
    debouncer.maybeExecute();
    debouncer.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fires, 0);
  });
});
