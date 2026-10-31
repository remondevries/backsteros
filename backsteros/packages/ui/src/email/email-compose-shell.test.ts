import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assembleComposeLetterBody,
  COMPOSE_UNKNOWN_FIRST_NAME,
  composeContactFirstName,
  languageFromMailboxEmail,
  pickComposeShellLanguage,
  renderComposePreviewShell,
  resolveComposeReplyTemplates,
} from "./email-compose-shell.js";

describe("email-compose-shell", () => {
  it("picks language from contact languages (legacy array)", () => {
    assert.equal(pickComposeShellLanguage(["nl"]), "nl");
    assert.equal(pickComposeShellLanguage(["en-US"]), "en");
    assert.equal(pickComposeShellLanguage([]), "en");
  });

  it("defaults from mailbox TLD and lets contact/org override", () => {
    assert.equal(languageFromMailboxEmail("remon@lemo-design.nl"), "nl");
    assert.equal(languageFromMailboxEmail("remon@lemo-design.com"), "en");
    assert.equal(
      pickComposeShellLanguage({
        fromEmailAddress: "remon@lemo-design.nl",
      }),
      "nl",
    );
    assert.equal(
      pickComposeShellLanguage({
        fromEmailAddress: "remon@lemo-design.com",
      }),
      "en",
    );
    assert.equal(
      pickComposeShellLanguage({
        fromEmailAddress: "remon@lemo-design.com",
        contactLanguages: ["nl"],
      }),
      "nl",
    );
    assert.equal(
      pickComposeShellLanguage({
        fromEmailAddress: "remon@lemo-design.nl",
        contactLanguages: ["en"],
      }),
      "en",
    );
    assert.equal(
      pickComposeShellLanguage({
        fromEmailAddress: "remon@lemo-design.com",
        organizationLanguages: ["nl"],
      }),
      "nl",
    );
    assert.equal(
      pickComposeShellLanguage({
        fromEmailAddress: "remon@lemo-design.com",
        contactLanguages: ["en"],
        organizationLanguages: ["nl"],
      }),
      "en",
    );
  });

  it("renders To/Aan with Unknown until a first name is known", () => {
    const templates = resolveComposeReplyTemplates({
      greetingTemplateEn: "To {firstName},",
      greetingTemplateNl: "Aan {firstName},",
      signOffTemplateEn: "Best,\n{name}",
      signOffTemplateNl: "Met vriendelijke groet,\n{name}",
    });
    assert.deepEqual(
      renderComposePreviewShell({
        templates,
        language: "en",
        firstName: null,
        signOffName: "Sander",
      }),
      {
        greeting: `To ${COMPOSE_UNKNOWN_FIRST_NAME},`,
        signOff: "Best,\nSander",
      },
    );
    assert.deepEqual(
      renderComposePreviewShell({
        templates,
        language: "nl",
        firstName: "Ada",
        signOffName: "Sander",
      }),
      {
        greeting: "Aan Ada,",
        signOff: "Met vriendelijke groet,\nSander",
      },
    );
    assert.deepEqual(
      renderComposePreviewShell({
        templates,
        language: "en",
        firstName: "Lemo Design",
        signOffName: "Sander",
      }),
      {
        greeting: "To Lemo Design,",
        signOff: "Best,\nSander",
      },
    );
  });

  it("composeContactFirstName takes the first token", () => {
    assert.equal(composeContactFirstName("Ada Lovelace"), "Ada");
    assert.equal(composeContactFirstName(null), null);
  });

  it("assembleComposeLetterBody joins greeting, body, and sign-off", () => {
    assert.equal(
      assembleComposeLetterBody({
        greeting: "Hi Ada,",
        body: "Please see attached.",
        signOff: "Best,\nRemon",
      }),
      "Hi Ada,\n\nPlease see attached.\n\nBest,\nRemon",
    );
    assert.equal(
      assembleComposeLetterBody({
        greeting: null,
        body: "Just the body",
        signOff: "  ",
      }),
      "Just the body",
    );
  });
});
