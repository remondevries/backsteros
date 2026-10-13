import assert from "node:assert/strict";
import test from "node:test";

import { buildEmailRelatedPropertyOptionData } from "./email-related-property-option-data.js";
import type { EmailListItem } from "./email.js";

function message(
  overrides: Partial<EmailListItem> & Pick<EmailListItem, "id" | "inboxId">,
): EmailListItem {
  return {
    kind: "message",
    subject: "Hello",
    from: "a@example.com",
    receivedAt: 1,
    ...overrides,
  };
}

test("buildEmailRelatedPropertyOptionData uses emailThreadId and skips drafts", () => {
  const options = buildEmailRelatedPropertyOptionData([
    message({
      id: "m1",
      inboxId: "in1",
      emailThreadId: "thread-1",
      number: 17,
      displayId: "E-17",
      subject: "Quote follow-up",
      threadId: "t1",
    }),
    message({
      id: "m2",
      inboxId: "in1",
      emailThreadId: "thread-1",
      number: 17,
      displayId: "E-17",
      subject: "Re: Quote follow-up",
      threadId: "t1",
      receivedAt: 2,
    }),
    {
      kind: "draft",
      id: "d1",
      inboxId: "in1",
      subject: "Draft",
      from: "",
      receivedAt: 3,
      emailThreadId: "thread-draft",
    },
    message({
      id: "m3",
      inboxId: "in1",
      subject: "No thread row",
    }),
  ]);
  assert.equal(options.length, 1);
  assert.equal(options[0]?.value, "thread-1");
  assert.equal(options[0]?.href, "/email/in1/m1");
  assert.ok(options[0]?.searchTerms.includes("E-17"));
});
