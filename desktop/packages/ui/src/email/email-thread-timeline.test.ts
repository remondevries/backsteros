import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findLiveEmailThreadDetailsKey,
  groupEmailThreadTimeline,
  type EmailThreadTimelineItem,
} from "./email-thread-timeline.js";

function item(
  key: string,
  kind: EmailThreadTimelineItem["kind"],
  at = 0,
): EmailThreadTimelineItem<string> {
  return { key, kind, at, node: key };
}

describe("groupEmailThreadTimeline", () => {
  it("keeps only emails visible as primary segments", () => {
    const segments = groupEmailThreadTimeline([
      item("email:1", "email", 1),
      item("comment:a", "detail", 2),
      item("comment-task:b", "detail", 3),
      item("email:2", "email", 4),
      item("reply:draft", "reply", 5),
    ]);

    assert.deepEqual(
      segments.map((segment) =>
        segment.type === "email"
          ? { type: segment.type, key: segment.key }
          : {
              type: segment.type,
              key: segment.key,
              items: segment.items.map((entry) => entry.key),
            },
      ),
      [
        { type: "email", key: "email:1" },
        {
          type: "details",
          key: "details:comment:a..comment-task:b",
          items: ["comment:a", "comment-task:b"],
        },
        { type: "email", key: "email:2" },
        { type: "email", key: "reply:draft" },
      ],
    );
  });

  it("groups trailing details before a reply draft", () => {
    const segments = groupEmailThreadTimeline([
      item("email:1", "email", 1),
      item("comment:a", "detail", 2),
      item("reply:draft", "reply", 3),
    ]);
    assert.equal(findLiveEmailThreadDetailsKey(segments), "details:comment:a..comment:a");
  });

  it("returns null when there are no detail runs", () => {
    const segments = groupEmailThreadTimeline([
      item("email:1", "email", 1),
      item("reply:draft", "reply", 2),
    ]);
    assert.equal(findLiveEmailThreadDetailsKey(segments), null);
  });
});
