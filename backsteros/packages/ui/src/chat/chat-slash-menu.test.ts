import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatThreadPeer } from "../components/chat/chat-thread-header.js";
import type { ChatProjectOption } from "./chat-project-option.js";
import {
  buildChatSlashMenu,
  flattenChatSlashMenu,
  resolveChatSlashCommand,
} from "./chat-slash-menu.ts";

const peers: ChatThreadPeer[] = [
  { id: "judith", kind: "contact", name: "Judith" },
  { id: "niels", kind: "contact", name: "Niels" },
  { id: "jaap", kind: "contact", name: "Jaap Vries" },
];

const projects: ChatProjectOption[] = [
  { id: "p1", key: "BSH", name: "BacksterOS" },
  { id: "p2", key: "EXIT", name: "Exit Ramp" },
  { id: "p3", key: "NIELS", name: "Niels Lab" },
];

describe("buildChatSlashMenu", () => {
  it("lists agents then projects (recent first)", () => {
    const sections = buildChatSlashMenu({
      text: "/",
      peers,
      projects,
      recentProjectIds: ["p3"],
    });
    assert.deepEqual(
      sections.map((section) => section.id),
      ["agents", "projects"],
    );
    assert.deepEqual(
      sections[1]?.items.map((item) => item.id),
      ["p3", "p1", "p2"],
    );
  });

  it("filters projects as you type", () => {
    const items = flattenChatSlashMenu(
      buildChatSlashMenu({ text: "/back", peers, projects }),
    );
    assert.deepEqual(
      items.filter((item) => item.kind === "project").map((item) => item.id),
      ["p1"],
    );
  });
});

describe("resolveChatSlashCommand", () => {
  it("resolves a project whose key is EXIT (no reserved /exit)", () => {
    const result = resolveChatSlashCommand({ text: "/exit", peers, projects });
    assert.equal(result?.type, "project");
    if (result?.type === "project") {
      assert.equal(result.project.id, "p2");
    }
  });

  it("resolves agents and projects", () => {
    assert.equal(
      resolveChatSlashCommand({ text: "/niels", peers, projects })?.type,
      "peer",
    );
    assert.equal(
      (
        resolveChatSlashCommand({ text: "/bsh", peers, projects }) as {
          type: "project";
          project: ChatProjectOption;
        }
      ).project.id,
      "p1",
    );
  });

  it("prefers an exact peer over a project with the same slug", () => {
    const result = resolveChatSlashCommand({
      text: "/niels",
      peers,
      projects,
    });
    assert.equal(result?.type, "peer");
    if (result?.type === "peer") {
      assert.equal(result.peer.id, "niels");
    }
  });
});
