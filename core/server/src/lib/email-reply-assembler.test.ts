import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assembleEmailHtml,
  assembleReplyEmail,
  assertValidEmailDraftHeaders,
  assertAssembledPreservesEditableBody,
  correctSelfOnlyTo,
  EMAIL_SIGN_OFF_AVATAR_CID,
  extractReplyBodyFromAssembled,
  greetingPartyFromRecipients,
  mergeEmailDraftHeaders,
  normalizeComposeRecipients,
  parseReplyToAddress,
  parseSenderFirstName,
  plainTextEmailToHtml,
  renderEmailReplyShell,
  replySubject,
  resolveEditableDraftBody,
  resolveEmailReplyTemplates,
  resolveReplyPartyFromMessage,
  sanitizeAgentReplyBody,
  splitIntoSentences,
  assertHasReplyableConceptRecipient,
  isNonReplyableEmailAddress,
  NAMELESS_EMAIL_GREETING_EN,
  NAMELESS_EMAIL_GREETING_NL,
  NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE,
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
    assert.equal(assembled.greeting, "Hi Ada,");
    assert.match(assembled.text, /We'll review the invoice this week\./);
    assert.match(assembled.text, /Best,\nRemon$/);
  });

  it("greets with display-name first name, not the local-part (exact)", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <a.lovelace@example.com>",
      to: ["a.lovelace@example.com"],
      subject: "Hello",
      body: "Thanks for the update.",
      templates: { signOffName: "Remon" },
    });
    assert.equal(assembled.greeting, "Hi Ada,");
    assert.equal(
      greetingPartyFromRecipients(
        ["a.lovelace@example.com"],
        ["a.lovelace@example.com"],
        "Ada Lovelace <a.lovelace@example.com>",
      ),
      "Ada Lovelace <a.lovelace@example.com>",
    );
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

  it("keeps Thank you for… body sentences (not only Thank you, sign-offs)", () => {
    const templates = resolveEmailReplyTemplates({
      greetingTemplateEn: "To {firstName},",
      greetingTemplateNl: "Aan {firstName},",
      signOffTemplateEn: "Sincerely,\n{name}\nLemo-Design",
      signOffTemplateNl: "Met vriendelijke groet,\n{name}\nLemo-Design",
      signOffName: "Eva",
    });
    const from = "campbellaworker582791@gmail.com";
    const body =
      "Thank you for your interest in Lemo-Design. We would be happy to discuss your project.";
    const assembled = assembleReplyEmail({
      from,
      subject: "Lemo-Design",
      body,
      templates,
    });
    assert.equal(assembled.body, body);
    assert.equal(
      resolveEditableDraftBody(assembled.text, from, templates),
      body,
    );
  });

  it("preserves multiple distinct paragraphs in sanitizeAgentReplyBody", () => {
    const body = [
      "Hierbij de boekingsregel met bedrag €17.183,09.",
      "",
      "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
    ].join("\n");
    assert.equal(sanitizeAgentReplyBody(body), body.trim());
    assert.match(sanitizeAgentReplyBody(body), /€17\.183,09/);
    assert.match(sanitizeAgentReplyBody(body), /P\.S\./);
  });

  it("capitalizes greeting first names", () => {
    const assembled = assembleReplyEmail({
      from: "fandy@fandy.nl",
      subject: "Test",
      body: "Even een korte vraag.",
      templates: {
        greetingTemplateNl: "Aan {firstName},",
        signOffTemplateNl: "Groeten,\n{name}",
        signOffName: "Remon",
      },
      languageHint: "nl",
      preserveBody: true,
    });
    assert.match(assembled.greeting, /^Aan Fandy,/);
  });

  it("reply party for self-sent mail uses the external recipient", () => {
    const party = resolveReplyPartyFromMessage(
      {
        from: "Remon <remon@lemo-design.com>",
        to: ["Fandy <fandy@fandy.nl>"],
      },
      "remon@lemo-design.com",
    );
    assert.equal(party, "Fandy <fandy@fandy.nl>");
  });

  it("normalizes recipient fields and honors To/Cc overrides on assemble", () => {
    assert.deepEqual(
      normalizeComposeRecipients("Ada <ada@example.com>, bob@example.com; ada@example.com"),
      ["ada@example.com", "bob@example.com"],
    );
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      to: "bob@example.com",
      cc: "cc@example.com, bob@example.com",
      subject: "Hello",
      body: "Thanks.",
      templates: { signOffName: "Remon" },
    });
    assert.deepEqual(assembled.to, ["bob@example.com"]);
    assert.deepEqual(assembled.cc, ["cc@example.com"]);
    assert.match(assembled.greeting, /^Hi Bob,/i);
  });

  it("returns empty body for greeting+sign-off shell with no middle", () => {
    const templates = resolveEmailReplyTemplates({
      greetingTemplateEn: "To {firstName},",
      signOffTemplateEn: "Sincerely,\n{name}\nLemo-Design",
      signOffName: "Eva",
    });
    const from = "campbellaworker582791@gmail.com";
    const assembled = assembleReplyEmail({
      from,
      subject: "Lemo-Design",
      body: "",
      templates,
    });
    assert.equal(assembled.body, "");
    assert.equal(
      resolveEditableDraftBody(assembled.text, from, templates),
      "",
    );
  });

  it("mergeEmailDraftHeaders keeps stored subject/To/Cc on body-only rewrite", () => {
    const merged = mergeEmailDraftHeaders({
      patch: {},
      storedTo: ["ada@example.com", "bob@example.com"],
      storedCc: ["cc@example.com"],
      storedSubject: "Re: Edited subject",
      fallbackTo: "Ada Lovelace <ada@example.com>",
    });
    assert.deepEqual(merged, {
      to: ["ada@example.com", "bob@example.com"],
      cc: ["cc@example.com"],
      subject: "Re: Edited subject",
    });
  });

  it("mergeEmailDraftHeaders empty-field rules and self-only To correction", () => {
    assert.deepEqual(
      mergeEmailDraftHeaders({
        patch: { to: [], subject: "", cc: undefined },
        storedTo: ["ada@example.com"],
        storedCc: ["kept@example.com"],
        storedSubject: "Keep me",
      }),
      {
        to: ["ada@example.com"],
        cc: ["kept@example.com"],
        subject: "Keep me",
      },
    );
    assert.deepEqual(
      mergeEmailDraftHeaders({
        patch: { cc: [] },
        storedTo: ["ada@example.com"],
        storedCc: ["clear-me@example.com"],
        storedSubject: "Subject",
      }).cc,
      [],
    );
    assert.deepEqual(
      correctSelfOnlyTo(
        ["remon@example.com"],
        "remon@example.com",
        "Ada <ada@example.com>",
      ),
      ["ada@example.com"],
    );
  });

  it("assertValidEmailDraftHeaders accepts quoted display names with commas", () => {
    assert.doesNotThrow(() =>
      assertValidEmailDraftHeaders({
        to: '"Lovelace, Ada" <a.lovelace@example.com>',
        requireTo: true,
      }),
    );
    assert.deepEqual(
      normalizeComposeRecipients(
        '"Lovelace, Ada" <a.lovelace@example.com>, bob@example.com',
      ),
      ["a.lovelace@example.com", "bob@example.com"],
    );
  });

  it("assertValidEmailDraftHeaders rejects CR/LF and empty/invalid To", () => {
    assert.throws(
      () =>
        assertValidEmailDraftHeaders({
          to: "ada@example.com\nBcc: evil@evil.com",
          requireTo: true,
        }),
      /line breaks/i,
    );
    assert.throws(
      () =>
        assertValidEmailDraftHeaders({
          subject: "Hello\r\nBcc: evil@evil.com",
        }),
      /line breaks/i,
    );
    assert.throws(
      () => assertValidEmailDraftHeaders({ to: [], requireTo: true }),
      /at least one valid/i,
    );
    assert.throws(
      () =>
        assertValidEmailDraftHeaders({
          to: "bad@nodot",
          requireTo: true,
        }),
      /Invalid To/i,
    );
    assert.throws(
      () =>
        assertValidEmailDraftHeaders({
          to: "not-an-email",
          requireTo: true,
        }),
      /Invalid To/i,
    );
    assert.doesNotThrow(() =>
      assertValidEmailDraftHeaders({
        to: "Ada <ada@example.com>",
        cc: "bob@example.com",
        subject: "Hello",
        requireTo: true,
      }),
    );
  });

  it("assertAssembledPreservesEditableBody allows one-word edits and deleted paragraphs", () => {
    const shelled = [
      "Hi Ada,",
      "",
      "Thanks for the detailed update on the invoice.",
      "",
      "Best,",
      "Remon",
    ].join("\n");
    assert.doesNotThrow(() =>
      assertAssembledPreservesEditableBody(
        shelled.replace(
          "Thanks for the detailed update on the invoice.",
          "Thanks for the update.",
        ),
        "Thanks for the update.",
      ),
    );
    assert.doesNotThrow(() =>
      assertAssembledPreservesEditableBody(
        ["Hi Ada,", "", "Only this paragraph remains.", "", "Best,", "Remon"].join(
          "\n",
        ),
        "Only this paragraph remains.",
      ),
    );
    assert.throws(
      () =>
        assertAssembledPreservesEditableBody(
          "Hi Ada,\n\nBest,\nRemon",
          "This body was dropped entirely.",
        ),
      /lose text/i,
    );
  });

  it("preserveSubject keeps an explicit user subject without Re:", () => {
    const assembled = assembleReplyEmail({
      from: "Ada Lovelace <ada@example.com>",
      subject: "Custom subject from user",
      body: "Hello.",
      templates: { signOffName: "Remon" },
      preserveSubject: true,
    });
    assert.equal(assembled.subject, "Custom subject from user");
  });

  it("OS-101: sanitize keeps bodies with decimals (EUR 18.15 / 10.65)", () => {
    const invoice1815 =
      "Thanks for sending over AgentMail invoice RLMOORV4-0001 for EUR 18.15. I'll go ahead and process it.";
    const invoice1065 =
      "Thank you, I have received the Cursor invoice FD651B1A-0032 (EUR 10.65) and will process it.";
    assert.equal(sanitizeAgentReplyBody(invoice1815), invoice1815);
    assert.equal(sanitizeAgentReplyBody(invoice1065), invoice1065);
  });

  it("OS-101: sanitize preserves decimals, times, versions, emails, URLs, P.S.", () => {
    for (const body of [
      "Hierbij de boekingsregel met bedrag €17.183,09.",
      "The call is at 15.33 today.",
      "We shipped v1.2.3 this morning.",
      "Reach me at financials@lemo-design.com or see https://lemo-design.com/x. Thanks again.",
      "P.S. This still belongs in the body.",
    ]) {
      assert.equal(sanitizeAgentReplyBody(body).replace(/\s+/g, ""), body.trim().replace(/\s+/g, ""));
    }
  });

  it("OS-101: splitIntoSentences never drops characters", () => {
    const sample = "Thanks for EUR 18.15. I'll go ahead and process it.";
    assert.equal(splitIntoSentences(sample).join(" "), sample);
  });

  it("OS-101: bare role local-parts get nameless greetings; john stays John", () => {
    const templates = resolveEmailReplyTemplates({
      greetingTemplateEn: "To {firstName},",
      greetingTemplateNl: "Aan {firstName},",
      signOffTemplateEn: "Sincerely,\n{name}",
      signOffName: "Ralph",
    });
    assert.equal(parseSenderFirstName("info@example.com"), "");
    assert.equal(parseSenderFirstName("john@example.com"), "John");
    assert.equal(
      assembleReplyEmail({ from: "info@example.com", subject: "Hi", body: "Thanks.", templates, languageHint: "en" }).greeting,
      NAMELESS_EMAIL_GREETING_EN,
    );
    assert.equal(
      assembleReplyEmail({ from: "john@example.com", subject: "Hi", body: "Thanks.", templates, languageHint: "en" }).greeting,
      "To John,",
    );
  });

  it("OS-101: Moneybird import addresses are non-replyable", () => {
    assert.equal(isNonReplyableEmailAddress("lemo-desig-7aa4efe6@inkomend.moneybird.nl"), true);
    assert.equal(resolveReplyPartyFromMessage({ from: "Remon <financials@lemo-design.com>", to: ["lemo-desig-7aa4efe6@inkomend.moneybird.nl"] }, "financials@lemo-design.com"), "");
    assert.throws(() => assertHasReplyableConceptRecipient([]), (e: unknown) => e instanceof Error && e.message === NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE);
  });

});
