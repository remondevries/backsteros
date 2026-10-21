import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractAgentReplyBody,
  resolveEditableEmailDraftBody,
} from "./email-draft-body.js";

/** OS-117 repro body (draft 92c08ef4…): greeting + intro + numbered 1–5. */
const OS117_NUMBERED_LIST_BODY = [
  "Allereerst gecondoleerd met het verlies van je moeder. Dat wensen we niemand toe.",
  "",
  "Hieronder per punt wat we hebben gecontroleerd en waar we staan:",
  "",
  "1. PHP-versies: beide websites draaien op PHP 8.3.30 (Ubuntu 24.04). De patch voor PHP 8.3 komt donderdagavond.",
  "",
  "2. Patch: er is vandaag om 16:00 Nederlandse tijd een security release aangekondigd op php.net voor kritieke kwetsbaarheden (CVSS 9.2).",
  "",
  "3. Aanvullende maatregelen: we hebben de WAF-regels aangescherpt via Cloudflare en rate limiting toegepast.",
  "",
  "4. Offline halen: we adviseren de websites online te houden en de logs te blijven monitoren op misbruik. Er zijn geen aanwijzingen voor een geslaagde aanval.",
  "",
  "5. Toegangslogs: we hebben de logs van de afgelopen 8 dagen bekeken. Daarin zien we normaal geautomatiseerd scanverkeer, 97 pogingen met een oudere PHP-exploit die op beide websites niet werkt, en ongeveer 26 duizend verzoeken naar bekende aanvalspaden, die allemaal zijn geblokkeerd. Er zijn geen aanwijzingen voor een geslaagde aanval.",
].join("\n");

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

test("extractAgentReplyBody keeps numbered list paragraphs (OS-117)", () => {
  const out = extractAgentReplyBody(OS117_NUMBERED_LIST_BODY);
  assert.match(out, /Allereerst gecondoleerd/);
  assert.match(out, /Hieronder per punt/);
  assert.match(out, /1\. PHP-versies/);
  assert.match(out, /2\. Patch/);
  assert.match(out, /3\. Aanvullende maatregelen/);
  assert.match(out, /4\. Offline halen/);
  assert.match(out, /5\. Toegangslogs/);
  const paragraphs = out
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  assert.equal(paragraphs.length, 7);
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

test("resolveEditableEmailDraftBody keeps all OS-117 numbered paragraphs", () => {
  const resolved = resolveEditableEmailDraftBody({
    greeting: "Aan Goudswaard,",
    signOff: "Met vriendelijke groet,\nRemon de Vries\nLemo-Design",
    body: OS117_NUMBERED_LIST_BODY,
  });
  const paragraphs = resolved
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  assert.equal(paragraphs.length, 7);
  assert.match(resolved, /1\. PHP-versies/);
  assert.match(resolved, /4\. Offline halen/);
  assert.match(resolved, /5\. Toegangslogs/);
  // Shared words across items 4 and 5 must not collapse the saved draft.
  assert.doesNotMatch(resolved, /^5\. Toegangslogs/);
});

test("resolveEditableEmailDraftBody strips shell without rewrite-collapse", () => {
  const full = [
    "Aan Goudswaard,",
    "",
    OS117_NUMBERED_LIST_BODY,
    "",
    "Met vriendelijke groet,",
    "Remon de Vries",
    "Lemo-Design",
  ].join("\n");
  const resolved = resolveEditableEmailDraftBody({
    greeting: "Aan Goudswaard,",
    signOff: "Met vriendelijke groet,\nRemon de Vries\nLemo-Design",
    text: full,
    body: null,
  });
  assert.doesNotMatch(resolved, /^Aan Goudswaard/);
  assert.doesNotMatch(resolved, /Lemo-Design$/);
  assert.equal(
    resolved.split(/\n\s*\n+/).filter((part) => part.trim()).length,
    7,
  );
});
