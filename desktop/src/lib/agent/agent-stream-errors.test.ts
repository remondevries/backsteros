import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isWritableIterableClosedError,
  stripTransientAgentStreamError,
} from "./agent-stream-errors.ts";

describe("stripTransientAgentStreamError", () => {
  it("strips the trailer after a successful reply", () => {
    const input =
      "Yes. BOD-3 is finished.\n\nError: RetriableError: WritableIterable is closed";
    assert.equal(stripTransientAgentStreamError(input), "Yes. BOD-3 is finished.");
  });

  it("keeps Stopped. when that is all that remains", () => {
    const input =
      "Stopped.\n\nError: RetriableError: WritableIterable is closed";
    assert.equal(stripTransientAgentStreamError(input), "Stopped.");
  });

  it("clears a message that is only the stream error", () => {
    assert.equal(
      stripTransientAgentStreamError(
        "Error: RetriableError: WritableIterable is closed",
      ),
      "",
    );
  });

  it("leaves unrelated assistant text alone", () => {
    const input = "Fixed the drag selection bug.";
    assert.equal(stripTransientAgentStreamError(input), input);
  });

  it("does not strip NonRetriableError provider failures", () => {
    const input =
      "Error: NonRetriableError: Provider Error Too many MCP tools are enabled.";
    assert.equal(stripTransientAgentStreamError(input), input);
  });
});

describe("isWritableIterableClosedError", () => {
  it("matches the known Cursor stream teardown", () => {
    assert.equal(
      isWritableIterableClosedError(
        "Error: RetriableError: WritableIterable is closed",
      ),
      true,
    );
  });

  it("rejects other errors", () => {
    assert.equal(isWritableIterableClosedError("Cancelled"), false);
    assert.equal(isWritableIterableClosedError(""), false);
    assert.equal(isWritableIterableClosedError(null), false);
  });
});
