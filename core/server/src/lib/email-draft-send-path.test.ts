import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertNoDraftBodyLoss,
  assembleReplyEmail,
  draftHasStoredShell,
  plainTextEmailToHtml,
  planDraftSendBodies,
  resolveEmailReplyTemplates,
  sanitizeAgentReplyBody,
} from "./email-reply-assembler.js";

/** OS-48 incident body: greeting, two paragraphs, amount, P.S., Dutch sign-off. */
const OS48_STORED_DRAFT = [
  "Aan Fandy,",
  "",
  "Hierbij de boekingsregel met bedrag €17.183,09 voor de kruisposten.",
  "",
  "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
  "",
  "Met vriendelijke groet,",
  "Remon",
].join("\n");

const OS48_STORED_HTML = plainTextEmailToHtml(OS48_STORED_DRAFT);

describe("email draft send path", () => {
  it("sends a stored shelled draft byte-for-byte (no reassemble)", () => {
    const plan = planDraftSendBodies({
      text: OS48_STORED_DRAFT,
      html: OS48_STORED_HTML,
      signOffName: "Remon",
    });
    assert.equal(plan.kind, "use_stored");
    if (plan.kind !== "use_stored") return;

    // text/html handed to send equals what AgentMail already stored
    assert.equal(plan.text, OS48_STORED_DRAFT);
    assert.equal(plan.html, OS48_STORED_HTML);
    assert.match(plan.text, /^Aan Fandy,/);
    assert.match(plan.text, /€17\.183,09/);
    assert.match(plan.text, /P\.S\. Ik heb zojuist/);
    assert.doesNotMatch(plan.text, /^Aan fandy,/m);
    assert.doesNotMatch(plan.text, /(^|\n)S\. /);
    assert.ok(plan.text.includes("boekingsregel"));
    assert.ok(plan.text.includes("Moneybird"));
    assert.ok(draftHasStoredShell(plan.text, plan.html, "Remon"));
  });

  it("refuses a lossy rebuild and keeps send from using truncated text", () => {
    const plan = planDraftSendBodies({
      text: "Hierbij de boekingsregel met bedrag €17.183,09.\n\nP.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
      html: null,
      signOffName: "Remon",
    });
    assert.equal(plan.kind, "reassemble");

    // Legacy-style truncation of the OS-48 incident
    const lossy = "Aan fandy,\n\nS. Ik heb zojuist van Moneybird begrepen...";
    assert.throws(
      () => assertNoDraftBodyLoss(OS48_STORED_DRAFT, lossy),
      /lose text/i,
    );
    // Nothing is sent when assert throws — callers must abort before sendDraft.
  });

  it("assertNoDraftBodyLoss boundary: 85% passes, just below refuses, short texts pass", () => {
    const stored = "a".repeat(100);
    assert.doesNotThrow(() => assertNoDraftBodyLoss(stored, "a".repeat(85)));
    assert.throws(
      () => assertNoDraftBodyLoss(stored, "a".repeat(84)),
      /lose text/i,
    );

    const short = "short body under forty chars";
    assert.ok(short.replace(/\s+/g, "").length < 40);
    assert.doesNotThrow(() => assertNoDraftBodyLoss(short, "x"));
  });

  it("preserveBody keeps OS-48 paragraphs that sanitize alone used to drop", () => {
    const templates = resolveEmailReplyTemplates({
      greetingTemplateNl: "Aan {firstName},",
      signOffTemplateNl: "Met vriendelijke groet,\n{name}",
      signOffName: "Remon",
    });
    const middle = [
      "Hierbij de boekingsregel met bedrag €17.183,09 voor de kruisposten.",
      "",
      "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
    ].join("\n");

    // Sanitizer alone must keep both paragraphs now (parser fix).
    const cleaned = sanitizeAgentReplyBody(middle);
    assert.match(cleaned, /€17\.183,09/);
    assert.match(cleaned, /P\.S\./);

    const assembled = assembleReplyEmail({
      from: "fandy@fandy.nl",
      subject: "Boekingsregel",
      body: middle,
      templates,
      languageHint: "nl",
      preserveBody: true,
    });
    assert.match(assembled.greeting, /^Aan Fandy,/);
    assert.equal(assembled.body, middle);
    assert.match(assembled.text, /€17\.183,09/);
    assert.match(assembled.text, /P\.S\. Ik heb zojuist/);
    assert.doesNotThrow(() =>
      assertNoDraftBodyLoss(OS48_STORED_DRAFT, assembled.text),
    );
  });
});
