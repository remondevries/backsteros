import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BacksterosApiClient } from "@backsteros/api-client";

import { patchEmailThreadMetadata } from "./email-thread-metadata";

describe("patchEmailThreadMetadata", () => {
  it("targets draft:<id> for a draft item with a parent threadId", async () => {
    const paths: string[] = [];
    const client = {
      requestJson: async (path: string) => {
        paths.push(path);
        return {};
      },
    } as unknown as BacksterosApiClient;

    await patchEmailThreadMetadata(
      client,
      {
        kind: "draft",
        id: "draft_reply_1",
        draftId: "draft_reply_1",
        inboxId: "inbox_1",
        threadId: "thread_parent",
      },
      { status: "in_progress" },
    );

    assert.equal(paths.length, 1);
    assert.match(
      paths[0] ?? "",
      /\/threads\/draft%3Adraft_reply_1\/metadata$/,
    );
  });

  it("targets the parent threadId for a message item", async () => {
    const paths: string[] = [];
    const client = {
      requestJson: async (path: string) => {
        paths.push(path);
        return {};
      },
    } as unknown as BacksterosApiClient;

    await patchEmailThreadMetadata(
      client,
      {
        kind: "message",
        id: "msg_1",
        inboxId: "inbox_1",
        threadId: "thread_parent",
      },
      { priority: 2 },
    );

    assert.equal(paths.length, 1);
    assert.match(paths[0] ?? "", /\/threads\/thread_parent\/metadata$/);
  });
});
