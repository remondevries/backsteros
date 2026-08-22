import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assembleEmailHtml,
  assembleReplyEmail,
  EMAIL_SIGN_OFF_AVATAR_CID,
  extractReplyBodyFromAssembled,
  parseReplyToAddress,
  parseSenderFirstName,
  plainTextEmailToHtml,
  renderEmailReplyShell,
  replySubject,
  resolveEditableDraftBody,
  resolveEmailReplyTemplates,
  sanitizeAgentReplyBody,
} from "./email-reply-assembler.js";

describe("email-reply-assembler", () => {
  it("parses addresses and first names", () => {
    assert.equal(
      parseReplyToAddress("Finance Team <finance@example.com>"),
      "finance@example.com",
    );
    assert.equal(parseSenderFirstName("Ada Lovelace <ada@example.com>"), "Ada");
    assert.equal(replySubject("Invoice"), "Re: Invoice");
    assert.equal(replySubject("Re: Invoice"), "Re: Invoice");
  });

  it("wraps agent body with greeting and sign-off", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Invoice",
      body: "We'll review the invoice this week.",
      templates: { signOffName: "Remon" },
    });
    assert.deepEqual(assembled.to, ["ada@example.com"]);
    assert.equal(assembled.subject, "Re: Invoice");
    assert.match(assembled.text, /^Hi Ada,/);
    assert.match(assembled.text, /We'll review the invoice this week\./);
    assert.match(assembled.text, /Best,\nRemon$/);
  });

  it("html alternative preserves the sign-off footer for recipients", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Invoice",
      body: "Please send the contract.",
      templates: {
        signOffTemplateEn: "Best,\n{name}",
        signOffName: "Ralph",
      },
    });
    assert.match(assembled.signOff, /Ralph/);
    assert.match(assembled.text, /Best,\nRalph$/);
    const html = plainTextEmailToHtml(assembled.text);
    assert.match(html, /Best,<br>\nRalph/);
    assert.doesNotMatch(html, /&lt;script/);
  });

  it("html footer places avatar beside sign-off text like the compose UI", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Invoice",
      body: "Please send the contract.",
      templates: {
        signOffTemplateEn: "Best,\n{name}",
        signOffName: "Ralph",
      },
    });
    const html = assembleEmailHtml(assembled, {
      signOffAvatarCid: EMAIL_SIGN_OFF_AVATAR_CID,
    });
    assert.match(html, new RegExp(`cid:${EMAIL_SIGN_OFF_AVATAR_CID}`));
    assert.match(html, /Best,<br>\nRalph/);
    assert.match(html, /border-radius:9999px/);
    assert.match(html, /Please send the contract/);
  });

  it("uses custom templates from settings", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Invoice",
      body: "We appreciate your note.",
      templates: {
        greetingTemplateEn: "Hello {firstName},",
        signOffTemplateEn: "Cheers,\n{name}",
        signOffTemplateNl: "Groeten,\n{name}",
        signOffName: "Team",
      },
    });
    assert.equal(
      assembled.text,
      ["Hello Ada,", "", "We appreciate your note.", "", "Cheers,", "Team"].join(
        "\n",
      ),
    );
  });

  it("picks Dutch greeting and sign-off from language detection", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Factuur",
      body: "Bedankt voor uw bericht. Wij hebben de factuur ontvangen.",
      templates: {
        greetingTemplateEn: "Hi {firstName},",
        greetingTemplateNl: "Beste {firstName},",
        signOffTemplateEn: "Best,\n{name}",
        signOffTemplateNl: "Met vriendelijke groet,\n{name}",
        signOffName: "Remon",
      },
      contextText: "Beste Remon, graag de factuur verwerken.",
    });
    assert.match(assembled.greeting, /^Beste Ada,/);
    assert.match(assembled.signOff, /Met vriendelijke groet/);
  });

  it("extracts editable body from assembled draft text", () => {
    const templates = resolveEmailReplyTemplates({ signOffName: "Remon" });
    const from = "Ada Lovelace <ada@example.com>";
    const full = assembleReplyEmail({
      from,
      subject: "Invoice",
      body: "We'll review the invoice this week.",
      templates,
    }).text;
    assert.equal(
      extractReplyBodyFromAssembled(full, from, templates),
      "We'll review the invoice this week.",
    );
  });

  it("strips agent greetings and sign-offs before wrapping", () => {
    const assembled = assembleReplyEmail({
      from: "Remon <remon@example.com>",
      subject: "Invoice 8959599",
      body: [
        "Beste,",
        "",
        "Bedankt voor het toesturen van factuur 8959599. We verwerken de betaling.",
        "",
        "Met vriendelijke groet,",
        "Remon",
      ].join("\n"),
    });
    assert.equal(
      assembled.text,
      [
        "Beste Remon,",
        "",
        "Bedankt voor het toesturen van factuur 8959599. We verwerken de betaling.",
        "",
        "Met vriendelijke groet,",
        "Remon",
      ].join("\n"),
    );
  });

  it("uses the English sign-off for English body text", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Invoice",
      body: "Thank you for sending the invoice. We will review it this week.",
      templates: {
        signOffTemplateEn: "Best,\n{name}",
        signOffTemplateNl: "Met vriendelijke groet,\n{name}",
        signOffName: "Remon",
      },
    });
    assert.match(assembled.text, /Best,\nRemon$/);
  });

  it("detects Dutch from incoming message context", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Factuur",
      body: "We will review it.",
      contextText:
        "Geachte heer, hierbij ontvangt u de factuur voor de geleverde diensten.",
      templates: {
        signOffTemplateEn: "Best,\n{name}",
        signOffTemplateNl: "Met vriendelijke groet,\n{name}",
        signOffName: "Remon",
      },
    });
    assert.match(assembled.text, /Met vriendelijke groet,\nRemon$/);
  });

  it("keeps the latest draft block and removes repeated sentences", () => {
    const noisy = [
      "Beste,",
      "",
      "Bedankt voor het toesturen van factuur 8959599. We hebben de factuur ontvangen en begrepen.",
      "",
      "Met vriendelijke groet,",
      "Remon",
      "Bedankt voor het toesturen van factuur 8959599. We hebben de factuur ontvangen en begrepen.",
      "Wij zijn het niet eens met factuur 8959599. Graag ontvangen wij een toelichting.",
      "Bedankt voor de notificatie en het toesturen van factuur 8959599. We hebben de factuur ontvangen, zullen deze verwerken en onze prijzen dienovereenkomstig bijwerken.",
      "",
      "Best,",
      "Remon",
    ].join("\n");

    const cleaned = sanitizeAgentReplyBody(noisy);
    assert.equal(
      cleaned,
      "Bedankt voor de notificatie en het toesturen van factuur 8959599. We hebben de factuur ontvangen, zullen deze verwerken en onze prijzen dienovereenkomstig bijwerken.",
    );
  });

  it("renders reply shell from templates", () => {
    const shell = renderEmailReplyShell("Ada Lovelace <ada@example.com>", {
      greetingTemplate: "Hi {firstName},",
      signOffTemplate: "Best,\n{name}",
      signOffName: "Remon",
    });
    assert.equal(shell.greeting, "Hi Ada,");
    assert.equal(shell.signOff, "Best,\nRemon");
  });

  it("extracts body when stored sign-off name differs from current templates", () => {
    const from = "Ada Lovelace <ada@example.com>";
    const stored = assembleReplyEmail({
      from,
      subject: "Invoice",
      body: "We'll review the invoice this week.",
      templates: {
        greetingTemplate: "Hi {firstName},",
        signOffTemplateEn: "Best,\n{name}",
        signOffName: "Ralph",
      },
    }).text;
    const currentTemplates = resolveEmailReplyTemplates({ signOffName: "Remon" });
    assert.equal(
      resolveEditableDraftBody(stored, from, currentTemplates),
      "We'll review the invoice this week.",
    );
  });
});
