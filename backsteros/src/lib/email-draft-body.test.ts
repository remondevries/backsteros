import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAgentReplyBody,
  resolveEditableEmailDraftBody,
} from "./email-draft-body.js";

test("extractAgentReplyBody keeps complementary paragraphs", () => {
  const body = [
    "Bedankt voor de herinnering. We hebben je rol inmiddels weer teruggezet van eigenaar naar boekhouder, dus je bent geen eigenaar meer.",
    "",
    "Dat kon omdat het probleem in de iOS-app van Moneybird met het overmaken van geld is opgelost, waardoor de eigenaarsrol niet meer nodig is.",
  ].join("\n");

  assert.equal(extractAgentReplyBody(body), body.trim());
});

test("extractAgentReplyBody collapses rewritten iterations to the last draft", () => {
  const body = [
    "Bedankt voor het toesturen van factuur 8959599. We hebben de factuur ontvangen en begrepen.",
    "",
    "Bedankt voor de notificatie en het toesturen van factuur 8959599. We hebben de factuur ontvangen, zullen deze verwerken en onze prijzen dienovereenkomstig bijwerken.",
  ].join("\n");

  assert.equal(
    extractAgentReplyBody(body),
    "Bedankt voor de notificatie en het toesturen van factuur 8959599. We hebben de factuur ontvangen, zullen deze verwerken en onze prijzen dienovereenkomstig bijwerken.",
  );
});

test("resolveEditableEmailDraftBody keeps multi-paragraph draft.body", () => {
  const paragraph1 =
    "Bedankt voor de herinnering. We hebben je rol inmiddels weer teruggezet van eigenaar naar boekhouder, dus je bent geen eigenaar meer.";
  const paragraph2 =
    "Dat kon omdat het probleem in de iOS-app van Moneybird met het overmaken van geld is opgelost, waardoor de eigenaarsrol niet meer nodig is.";
  const resolved = resolveEditableEmailDraftBody({
    greeting: "Aan Fandy,",
    signOff: "Met vriendelijke groet,\nRemon de Vries\nLemo-Design",
    body: `${paragraph1}\n\n${paragraph2}`,
  });
  assert.match(resolved, /Bedankt voor de herinnering/);
  assert.match(resolved, /Dat kon omdat het probleem/);
});
