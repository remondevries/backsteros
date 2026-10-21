import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatOrganizationVCard,
  organizationEtag,
  parseOrganizationVCard,
  type OrganizationVCardSource,
} from "./org-vcard.js";

const sample: OrganizationVCardSource = {
  id: "org-abc123",
  name: "Quarry Mill",
  email: "hello@quarrymill.com",
  emails: [{ label: "general", address: "hello@quarrymill.com" }],
  phone: "058 123 4567",
  phones: [{ label: "general", number: "058 123 4567" }],
  website: "https://quarrymill.com",
  address: "Street 1",
  city: "Leeuwarden",
  postalCode: "8911",
  region: "FR",
  country: "NL",
  socialAccounts: [],
  notes: "Client",
  updatedAt: new Date("2026-10-21T12:00:00.000Z"),
};

test("formatOrganizationVCard is an Apple company card", () => {
  const vcf = formatOrganizationVCard(sample);
  assert.match(vcf, /UID:org-abc123/);
  assert.match(vcf, /FN:Quarry Mill/);
  assert.match(vcf, /ORG:Quarry Mill/);
  assert.match(vcf, /X-ABShowAs:COMPANY/);
  assert.match(vcf, /TEL;TYPE=WORK,VOICE:058 123 4567/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET;TYPE=WORK:hello@quarrymill.com/);
  assert.match(vcf, /ADR;TYPE=WORK:/);
  assert.match(vcf, /URL:https:\/\/quarrymill.com/);
});

test("parseOrganizationVCard round-trips core fields and PHOTO", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const vcf = formatOrganizationVCard(sample, {
    contentType: "image/jpeg",
    bytes,
  });
  assert.match(vcf, /PHOTO;ENCODING=B;TYPE=JPEG:/);
  const parsed = parseOrganizationVCard(vcf);
  assert.ok(parsed);
  assert.equal(parsed!.uid, "org-abc123");
  assert.equal(parsed!.name, "Quarry Mill");
  assert.equal(parsed!.isCompany, true);
  assert.equal(parsed!.emails[0]?.address, "hello@quarrymill.com");
  assert.equal(parsed!.phones[0]?.number, "058 123 4567");
  assert.equal(parsed!.website, "https://quarrymill.com");
  assert.deepEqual([...parsed!.photo!.bytes], [0xff, 0xd8, 0xff, 0xd9]);
});

test("organizationEtag is stable", () => {
  assert.equal(organizationEtag(sample), organizationEtag(sample));
});
