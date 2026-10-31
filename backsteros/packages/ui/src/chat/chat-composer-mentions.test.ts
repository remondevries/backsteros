import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPTY_MENTION_CATALOG } from "../mentions/empty-catalog.js";
import type { MentionCatalog, MentionItem } from "../mentions/mention-menu-types.js";
import {
  computePlainTextMentionTrigger,
  insertMentionItemAtTrigger,
  insertMentionTokenAtTrigger,
  mentionItemChipLabel,
  parseComposerMentionDoc,
  resolveComposerMentionChipLabel,
  roundTripComposerMentionText,
  serializeComposerMentionDoc,
} from "./chat-composer-mentions.js";

describe("computePlainTextMentionTrigger", () => {
  it("opens after @ at the start of the line", () => {
    const trigger = computePlainTextMentionTrigger("@os", 3);
    assert.deepEqual(trigger, { from: 0, to: 3, query: "os" });
  });

  it("opens after whitespace mid-line", () => {
    const text = "Hi [@contact:remon] see @OS";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    assert.equal(trigger!.query, "OS");
    assert.equal(text.slice(trigger!.from, trigger!.to), "@OS");
  });

  it("returns null when not in a mention query", () => {
    assert.equal(computePlainTextMentionTrigger("hello world", 5), null);
  });

  it("scopes to the current line", () => {
    const text = "@old\n@new";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    assert.equal(trigger!.query, "new");
    assert.equal(text.slice(trigger!.from, trigger!.to), "@new");
  });
});

describe("insertMentionTokenAtTrigger", () => {
  it("replaces @query with the token and a trailing space", () => {
    const text = "See @OS";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    const result = insertMentionTokenAtTrigger(
      text,
      trigger!,
      "[@task:OS-144]",
    );
    assert.equal(result.text, "See [@task:OS-144] ");
    assert.equal(result.cursor, "See [@task:OS-144] ".length);
  });
});

describe("insertMentionItemAtTrigger", () => {
  it("uses the contact name as the chip label and keeps a trailing space", () => {
    const item = {
      kind: "contact",
      id: "c1",
      key: "C-251",
      name: "Remon de Vries",
      title: null,
      organizationName: null,
      number: 251,
      displayId: "C-251",
      avatarStorageKey: null,
      avatarUpdatedAt: 0,
    } satisfies MentionItem;
    const text = "Hi @rem";
    const trigger = computePlainTextMentionTrigger(text, text.length);
    assert.ok(trigger);
    const result = insertMentionItemAtTrigger(text, trigger!, item);
    assert.equal(result.text, "Hi [@contact:C-251] ");
    assert.equal(result.label, "Remon de Vries");
    assert.match(result.text, / $/);
  });
});

describe("composer mention serialization", () => {
  it("round-trips tokens and surrounding whitespace", () => {
    const original =
      "Hi  [@contact:C-251]  see [@task:OS-144] trailing  ";
    assert.equal(roundTripComposerMentionText(original), original);
  });

  it("preserves a lone trailing space after text", () => {
    assert.equal(roundTripComposerMentionText("dsadsad "), "dsadsad ");
  });

  it("parses mentions into chips and serializes raw tokens again", () => {
    const catalog: MentionCatalog = {
      ...EMPTY_MENTION_CATALOG,
      contacts: [
        {
          ...EMPTY_MENTION_CATALOG.contacts[0],
          id: "c1",
          key: "remon",
          name: "Remon de Vries",
          title: null,
          number: 251,
          displayId: "C-251",
          email: null,
          summary: null,
          avatarStorageKey: null,
          avatarUpdatedAt: null,
        } as MentionCatalog["contacts"][number],
      ],
    };

    const segments = parseComposerMentionDoc(
      "Ping [@contact:C-251] please",
      catalog,
    );
    assert.equal(segments.length, 3);
    assert.equal(segments[0]?.type, "text");
    assert.equal(segments[1]?.type, "mention");
    if (segments[1]?.type === "mention") {
      assert.equal(segments[1].raw, "[@contact:C-251]");
      assert.equal(segments[1].label, "Remon de Vries");
    }
    assert.equal(
      serializeComposerMentionDoc(segments),
      "Ping [@contact:C-251] please",
    );
  });

  it("falls back to the token key when the catalog has no match", () => {
    const segments = parseComposerMentionDoc("[@organization:acme]");
    assert.equal(segments[0]?.type, "mention");
    if (segments[0]?.type === "mention") {
      assert.equal(segments[0].label, "acme");
    }
  });
});

describe("mentionItemChipLabel / resolveComposerMentionChipLabel", () => {
  it("prefers contact name over key", () => {
    assert.equal(
      mentionItemChipLabel({
        kind: "contact",
        id: "c1",
        key: "C-251",
        name: "Remon",
        title: null,
        organizationName: null,
        number: 251,
        displayId: "C-251",
        avatarStorageKey: null,
        avatarUpdatedAt: 0,
      }),
      "Remon",
    );
  });

  it("uses preferredLabel when provided", () => {
    const token = parseComposerMentionDoc("[@task:OS-1]")[0];
    assert.ok(token && token.type === "mention");
    assert.equal(
      resolveComposerMentionChipLabel(token.token, null, "Support ticket"),
      "Support ticket",
    );
  });
});
