import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchChatContact } from "./match-chat-contact.js";

describe("matchChatContact", () => {
  it("matches by email", () => {
    const contacts = [
      { id: "c1", email: "ada@example.com" },
      {
        id: "c2",
        emails: [{ address: "bob@work.test" }],
      },
    ];
    assert.equal(
      matchChatContact(contacts, { contactEmail: "bob@work.test" })?.id,
      "c2",
    );
  });

  it("matches by phone when email is missing", () => {
    const contacts = [{ id: "c1", phone: "+31 6 1550 8080" }];
    assert.equal(
      matchChatContact(contacts, { contactPhone: "+31615508080" })?.id,
      "c1",
    );
  });

  it("returns null when nothing matches", () => {
    assert.equal(
      matchChatContact([{ id: "c1", email: "ada@example.com" }], {
        contactEmail: "other@example.com",
        contactPhone: "+1000",
      }),
      null,
    );
  });
});
