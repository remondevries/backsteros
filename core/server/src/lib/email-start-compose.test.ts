import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assembleComposeEmail,
  NAMELESS_EMAIL_GREETING_EN,
} from "./email-reply-assembler.js";
import {
  recipientFirstNameFromContact,
  resolveEmailStartStatus,
  shouldWrapEmailStartBody,
} from "../services/agentmail-settings/send-lifecycle.js";

describe("OS-146 email start compose greeting", () => {
  const templates = {
    greetingTemplateEn: "Hi {firstName},",
    signOffTemplateEn: "Sincerely,\n{name}",
    signOffName: "Remon de Vries, Lemo-Design",
  };

  it("never greets from the email local-part (To Email,)", () => {
    const assembled = assembleComposeEmail({
      to: "email@remondevries.com",
      subject: "Hello",
      body: "Can we talk?",
      templates,
      recipientFirstName: "",
    });
    assert.equal(assembled.greeting, NAMELESS_EMAIL_GREETING_EN);
    assert.match(assembled.text, /^Hello,/);
    assert.doesNotMatch(assembled.text, /To Email/i);
    assert.doesNotMatch(assembled.text, /Hi Email/i);
  });

  it("uses the linked contact first name in the greeting", () => {
    const assembled = assembleComposeEmail({
      to: "email@remondevries.com",
      subject: "Hello",
      body: "Can we talk?",
      templates,
      recipientFirstName: "Remon",
    });
    assert.equal(assembled.greeting, "Hi Remon,");
    assert.match(assembled.text, /^Hi Remon,/);
    assert.match(assembled.text, /Sincerely,\nRemon de Vries, Lemo-Design/);
  });

  it("wrap:false / raw sends the body as-is", () => {
    const assembled = assembleComposeEmail({
      to: "email@remondevries.com",
      subject: "Hello",
      body: "Just the body",
      templates,
      recipientFirstName: "Remon",
      wrap: false,
    });
    assert.equal(assembled.text, "Just the body");
    assert.equal(assembled.greeting, "");
    assert.equal(assembled.signOff, "");
  });
});

describe("OS-146 email start helpers", () => {
  it("recipientFirstNameFromContact prefers firstName and never uses email", () => {
    assert.equal(
      recipientFirstNameFromContact({
        id: "c1",
        firstName: "Jan",
        name: "Jan Jansen",
        email: "email@remondevries.com",
      }),
      "Jan",
    );
    assert.equal(
      recipientFirstNameFromContact({
        id: "c1",
        firstName: null,
        name: "Ada Lovelace",
        email: "email@remondevries.com",
      }),
      "Ada",
    );
    assert.equal(
      recipientFirstNameFromContact({
        id: "c1",
        firstName: null,
        name: null,
        email: "email@remondevries.com",
      }),
      "",
    );
    assert.equal(recipientFirstNameFromContact(null), "");
  });

  it("shouldWrapEmailStartBody respects wrap:false and raw:true", () => {
    assert.equal(shouldWrapEmailStartBody({}), true);
    assert.equal(shouldWrapEmailStartBody({ wrap: true }), true);
    assert.equal(shouldWrapEmailStartBody({ wrap: false }), false);
    assert.equal(shouldWrapEmailStartBody({ raw: true }), false);
    assert.equal(shouldWrapEmailStartBody({ raw: true, wrap: true }), false);
  });

  it("resolveEmailStartStatus defaults to waiting and validates", () => {
    assert.equal(resolveEmailStartStatus(undefined), "waiting");
    assert.equal(resolveEmailStartStatus("in_progress"), "in_progress");
    assert.throws(
      () => resolveEmailStartStatus("not_a_status"),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            (error as { code?: string }).code === "invalid_status",
        ),
    );
  });
});
