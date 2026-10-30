import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchProjectsBySlashQuery,
  orderChatProjects,
  projectCommandSlug,
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
