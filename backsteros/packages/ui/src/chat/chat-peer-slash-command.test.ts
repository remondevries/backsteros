import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatThreadPeer } from "../components/chat/chat-thread-header.js";
import {
  matchPeersBySlashQuery,
  parsePeerSlashCommand,
  peerCommandSlug,
  resolvePeerSlashCommand,
} from "./chat-peer-slash-command.js";

const peers: ChatThreadPeer[] = [
  { id: "1", kind: "contact", name: "Judith" },
  { id: "2", kind: "contact", name: "Jaap Vries" },
  { id: "3", kind: "contact", name: "Jane" },
];

describe("peerCommandSlug", () => {
  it("strips spaces and diacritics", () => {
    assert.equal(peerCommandSlug("Jaap Vries"), "jaapvries");
    assert.equal(peerCommandSlug("José"), "jose");
  });
});

describe("parsePeerSlashCommand", () => {
  it("parses lone /commands", () => {
    assert.equal(parsePeerSlashCommand("/jaap"), "jaap");
    assert.equal(parsePeerSlashCommand("  /Jaap  "), "jaap");
    assert.equal(parsePeerSlashCommand("/"), "");
  });

  it("ignores normal messages", () => {
    assert.equal(parsePeerSlashCommand("hello"), null);
    assert.equal(parsePeerSlashCommand("/jaap please"), null);
    assert.equal(parsePeerSlashCommand("go /jaap"), null);
  });
});

describe("matchPeersBySlashQuery", () => {
  it("matches first name and full slug prefixes", () => {
    assert.deepEqual(
      matchPeersBySlashQuery(peers, "jaa").map((peer) => peer.id),
      ["2"],
    );
    assert.deepEqual(
      matchPeersBySlashQuery(peers, "ja").map((peer) => peer.id),
      ["2", "3"],
    );
    assert.deepEqual(
      matchPeersBySlashQuery(peers, "jaapvries").map((peer) => peer.id),
      ["2"],
    );
  });
});

describe("resolvePeerSlashCommand", () => {
  it("resolves /jaap to Jaap Vries", () => {
    assert.equal(resolvePeerSlashCommand("/jaap", peers)?.id, "2");
  });

  it("requires a unique match when ambiguous", () => {
    assert.equal(resolvePeerSlashCommand("/ja", peers), null);
  });

  it("returns null for unknown agents", () => {
    assert.equal(resolvePeerSlashCommand("/nobody", peers), null);
  });
});
