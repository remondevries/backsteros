import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildInboxEmailListItem } from "@backsteros/ui";

import {
  discardEmailMessageDetailCache,
  writeEmailMessageDetailCache,
} from "./email-message-detail-cache.ts";
import { resolveEmailDetailPrefetchTargets } from "./email-detail-list-prefetch.ts";

function email(
  messageId: string,
  opts?: { draftId?: string },
) {
  return buildInboxEmailListItem({
    inboxId: "box",
    messageId,
    draftId: opts?.draftId ?? null,
    title: messageId,
    status: "triage",
  });
}

describe("resolveEmailDetailPrefetchTargets", () => {
  beforeEach(() => {
    discardEmailMessageDetailCache("box", "m1");
    discardEmailMessageDetailCache("box", "m2");
    discardEmailMessageDetailCache("box", "m3");
    discardEmailMessageDetailCache("box", "m4");
  });

  it("prefers a window around the focused email row", () => {
    const emails = [email("m1"), email("m2"), email("m3"), email("m4")];
    const ordered = emails.map((entry) => entry.id);
    const focus = emails[2]!.id;
    const targets = resolveEmailDetailPrefetchTargets({
      emails,
      orderedRowIds: ["chat-1", ...ordered],
      focusRowId: focus,
      neighborRadius: 1,
      limit: 10,
    });
    assert.deepEqual(
      targets.map((target) => target.id),
      ["m2", "m3", "m4"],
    );
  });

  it("falls back to the top of the list without focus", () => {
    const emails = [email("m1"), email("m2"), email("m3")];
    const targets = resolveEmailDetailPrefetchTargets({
      emails,
      orderedRowIds: emails.map((entry) => entry.id),
      limit: 2,
    });
    assert.deepEqual(
      targets.map((target) => target.id),
      ["m1", "m2"],
    );
  });

  it("skips message ids that are already warm in the detail cache", () => {
    writeEmailMessageDetailCache("box", "m1", {
      kind: "message",
      inboxId: "box",
      messageId: "m1",
      subject: "Hello",
      from: "a@example.com",
      preview: "Hi",
      timestamp: new Date().toISOString(),
      text: "Hi",
      html: null,
      extractedText: null,
      extractedHtml: null,
    } as never);
    const emails = [email("m1"), email("m2")];
    const targets = resolveEmailDetailPrefetchTargets({
      emails,
      orderedRowIds: emails.map((entry) => entry.id),
      limit: 10,
    });
    assert.deepEqual(
      targets.map((target) => target.id),
      ["m2"],
    );
  });

  it("queues draft details for draft rows", () => {
    const draft = email("draft-row", { draftId: "d1" });
    const targets = resolveEmailDetailPrefetchTargets({
      emails: [draft],
      orderedRowIds: [draft.id],
      limit: 5,
    });
    assert.deepEqual(targets, [
      { kind: "draft", inboxId: "box", id: "d1" },
    ]);
  });
});
