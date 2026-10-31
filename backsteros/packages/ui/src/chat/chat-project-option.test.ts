import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterRecentChatProjectIds,
  isChatProjectRoomReady,
  matchProjectsBySlashQuery,
  orderChatProjects,
  projectCommandSlug,
  resolveRecentChatProjectsForStrip,
  type ChatProjectOption,
} from "./chat-project-option.ts";

const projects: ChatProjectOption[] = [
  { id: "a", key: "AAA", name: "Alpha" },
  { id: "b", key: "BBB", name: "Beta" },
  { id: "c", key: "CCC", name: "Charlie" },
];

describe("projectCommandSlug", () => {
  it("prefers the project key", () => {
    assert.equal(
      projectCommandSlug({ id: "1", key: "BSH", name: "BacksterOS" }),
      "bsh",
    );
  });
});

describe("isChatProjectRoomReady", () => {
  it("requires active status and a channel uri", () => {
    assert.equal(
      isChatProjectRoomReady({
        id: "1",
        key: "BSH",
        name: "BacksterOS",
        channelStatus: "active",
        channelUri: "https://x.com/i/grok?conversation=1",
      }),
      true,
    );
    assert.equal(
      isChatProjectRoomReady({
        id: "1",
        key: "BSH",
        name: "BacksterOS",
        channelStatus: "active",
        channelUri: null,
      }),
      false,
    );
    assert.equal(
      isChatProjectRoomReady({
        id: "1",
        key: "BSH",
        name: "BacksterOS",
        channelStatus: "connecting",
        channelUri: "https://x.com/i/grok?conversation=1",
      }),
      false,
    );
    assert.equal(
      isChatProjectRoomReady({
        id: "1",
        key: "BSH",
        name: "BacksterOS",
      }),
      false,
    );
  });
});

describe("orderChatProjects", () => {
  it("puts recent ids first then A→Z", () => {
    assert.deepEqual(
      orderChatProjects(projects, ["c", "missing", "a"]).map((p) => p.id),
      ["c", "a", "b"],
    );
  });
});

describe("matchProjectsBySlashQuery", () => {
  it("matches key and name prefixes with recent order", () => {
    assert.deepEqual(
      matchProjectsBySlashQuery(projects, "b", ["c"]).map((p) => p.id),
      ["b"],
    );
    assert.deepEqual(
      matchProjectsBySlashQuery(projects, "", ["b"]).map((p) => p.id),
      ["b", "a", "c"],
    );
  });
});

describe("resolveRecentChatProjectsForStrip", () => {
  it("shows up to 5 recent projects oldest→newest (newest left of agents)", () => {
    const many: ChatProjectOption[] = [
      { id: "1", key: "P1", name: "One" },
      { id: "2", key: "P2", name: "Two" },
      { id: "3", key: "P3", name: "Three" },
      { id: "4", key: "P4", name: "Four" },
      { id: "5", key: "P5", name: "Five" },
      { id: "6", key: "P6", name: "Six" },
    ];
    assert.deepEqual(
      resolveRecentChatProjectsForStrip(many, [
        "6",
        "5",
        "4",
        "3",
        "2",
        "1",
      ]).map((p) => p.id),
      ["2", "3", "4", "5", "6"],
    );
  });

  it("pins the active project into the strip", () => {
    assert.deepEqual(
      resolveRecentChatProjectsForStrip(projects, ["b"], "c").map((p) => p.id),
      ["b", "c"],
    );
  });

  it("skips deleted projects that are still in recent ids", () => {
    assert.deepEqual(
      resolveRecentChatProjectsForStrip(projects, ["gone", "b", "a"]).map(
        (p) => p.id,
      ),
      ["a", "b"],
    );
  });
});

describe("filterRecentChatProjectIds", () => {
  it("drops ids that are no longer in the workspace", () => {
    assert.deepEqual(
      filterRecentChatProjectIds(["a", "gone", "b"], ["a", "b", "c"]),
      ["a", "b"],
    );
  });
});
