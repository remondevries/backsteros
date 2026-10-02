import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  naturalKeyColumnsFor,
  naturalKeyForkWinner,
} from "./natural-key-conflicts.js";

describe("natural-key fork resolution (OS-40)", () => {
  const older = new Date("2026-09-13T17:41:20.092Z");
  const newer = new Date("2026-09-13T18:21:18.316Z");

  it("registers space_publish_settings on (workspace_id, space_document_id)", () => {
    assert.deepEqual(naturalKeyColumnsFor("space_publish_settings"), [
      "workspace_id",
      "space_document_id",
    ]);
    assert.equal(naturalKeyColumnsFor("tasks"), null);
  });

  it("newest updated_at wins", () => {
    assert.equal(
      naturalKeyForkWinner(
        { id: "PWt24_zXh8RAG-Nt6SHRr", updatedAt: newer },
        { id: "-dvvMp0mJVHCR8CI9guGM", updatedAt: older },
      ),
      "incoming",
    );
    assert.equal(
      naturalKeyForkWinner(
        { id: "-dvvMp0mJVHCR8CI9guGM", updatedAt: older },
        { id: "PWt24_zXh8RAG-Nt6SHRr", updatedAt: newer },
      ),
      "existing",
    );
  });

  it("is symmetric on both peers, including ties", () => {
    for (const [a, b] of [
      [older, newer],
      [newer, older],
      [older, older],
    ] as const) {
      const x = { id: "AUy2UwhJSMT3K-RZab9Uj", updatedAt: a };
      const y = { id: "q4qdjK1S5WV7q7rCUwLt5", updatedAt: b };
      const onPeer1 = naturalKeyForkWinner(x, y) === "incoming" ? x.id : y.id;
      const onPeer2 = naturalKeyForkWinner(y, x) === "incoming" ? y.id : x.id;
      assert.equal(onPeer1, onPeer2);
    }
  });

  it("tie keeps the larger id", () => {
    assert.equal(
      naturalKeyForkWinner(
        { id: "b", updatedAt: older },
        { id: "a", updatedAt: older },
      ),
      "incoming",
    );
  });

  it("an unparseable timestamp loses to a valid one", () => {
    assert.equal(
      naturalKeyForkWinner(
        { id: "a", updatedAt: new Date("nope") },
        { id: "b", updatedAt: older },
      ),
      "existing",
    );
  });
});
