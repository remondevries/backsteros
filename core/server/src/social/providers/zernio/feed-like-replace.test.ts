import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ZernioApiError } from "./client.js";
import {
  likeCommentReplacingConflict,
  likePostReplacingConflict,
} from "./feed-like-replace.js";

describe("likePostReplacingConflict", () => {
  it("returns the first like when it succeeds", async () => {
    const calls: string[] = [];
    const result = await likePostReplacingConflict(
      {
        async likePost() {
          calls.push("like");
          return { liked: true, reactionType: "PRAISE" };
        },
        async unlikePost() {
          calls.push("unlike");
          return {};
        },
      },
      "post-1",
      { accountId: "acc-1", reactionType: "PRAISE" },
    );
    assert.deepEqual(result, { liked: true, reactionType: "PRAISE" });
    assert.deepEqual(calls, ["like"]);
  });

  it("unlikes then re-likes on LinkedIn 409 conflict", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const result = await likePostReplacingConflict(
      {
        async likePost(_postId, body) {
          attempts += 1;
          calls.push(`like:${body.reactionType ?? "LIKE"}`);
          if (attempts === 1) {
            throw new ZernioApiError(409, "", "conflict", "invalid_resource_state");
          }
          return { liked: true, reactionType: body.reactionType };
        },
        async unlikePost() {
          calls.push("unlike");
          return {};
        },
      },
      "post-1",
      { accountId: "acc-1", reactionType: "EMPATHY" },
    );
    assert.deepEqual(result, { liked: true, reactionType: "EMPATHY" });
    assert.deepEqual(calls, ["like:EMPATHY", "unlike", "like:EMPATHY"]);
  });

  it("replaces when alreadyReacted echoes a different type", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const result = await likePostReplacingConflict(
      {
        async likePost(_postId, body) {
          attempts += 1;
          calls.push(`like:${body.reactionType ?? "LIKE"}`);
          if (attempts === 1) {
            return { liked: true, alreadyReacted: true, reactionType: "LIKE" };
          }
          return { liked: true, reactionType: body.reactionType };
        },
        async unlikePost() {
          calls.push("unlike");
          return {};
        },
      },
      "post-1",
      { accountId: "acc-1", reactionType: "INTEREST" },
    );
    assert.deepEqual(result, { liked: true, reactionType: "INTEREST" });
    assert.deepEqual(calls, ["like:INTEREST", "unlike", "like:INTEREST"]);
  });

  it("rethrows non-409 errors", async () => {
    await assert.rejects(
      () =>
        likePostReplacingConflict(
          {
            async likePost() {
              throw new ZernioApiError(403, "", "forbidden");
            },
            async unlikePost() {
              return {};
            },
          },
          "post-1",
          { accountId: "acc-1" },
        ),
      (error: unknown) =>
        error instanceof ZernioApiError && error.status === 403,
    );
  });
});

describe("likeCommentReplacingConflict", () => {
  it("unlikes then re-likes on 409", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const result = await likeCommentReplacingConflict(
      {
        async likeComment() {
          attempts += 1;
          calls.push("like");
          if (attempts === 1) {
            throw new ZernioApiError(409, "", "conflict");
          }
          return { liked: true, reactionType: "LIKE" };
        },
        async unlikeComment() {
          calls.push("unlike");
          return {};
        },
      },
      "post-1",
      "comment-1",
      { accountId: "acc-1", reactionType: "LIKE" },
    );
    assert.deepEqual(result, { liked: true, reactionType: "LIKE" });
    assert.deepEqual(calls, ["like", "unlike", "like"]);
  });
});
