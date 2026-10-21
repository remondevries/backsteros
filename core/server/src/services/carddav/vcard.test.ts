import assert from "node:assert/strict";
import { test } from "node:test";

import {
  contactEtag,
  formatVCard,
  parseVCard,
  type ContactVCardSource,
} from "./vcard.js";

const sample: ContactVCardSource = {
  id: "contact-abc123",
  firstName: "Remon",
  lastName: "de Vries",
  name: "Remon de Vries",
  title: "Founder",
  email: "email@remondevries.com",
  emails: [{ label: "personal", address: "email@remondevries.com" }],
  phone: "058 266 4242",
  phones: [{ label: "work", number: "058 266 4242" }],
  address: "Street 1",
  city: "Leeuwarden",
  postalCode: "8911",
  region: "FR",
  country: "NL",
  birthday: "1990-05-01",
  socialAccounts: [{ platform: "linkedin", url: "https://linkedin.com/in/remon" }],
  notes: "Hello",
  organizationName: "Lemo-Design",
  updatedAt: new Date("2026-10-21T12:00:00.000Z"),
};

test("formatVCard includes UID FN N and fields", () => {
  const vcf = formatVCard(sample);
  assert.match(vcf, /BEGIN:VCARD/);
  assert.match(vcf, /UID:contact-abc123/);
  assert.match(vcf, /FN:Remon de Vries/);
  assert.match(vcf, /N:de Vries;Remon;;;/);
  assert.match(vcf, /EMAIL;TYPE=INTERNET;TYPE=HOME:email@remondevries.com/);
  assert.match(vcf, /TEL;TYPE=WORK,VOICE:058 266 4242/);
  assert.match(vcf, /ORG:Lemo-Design/);
  assert.match(vcf, /BDAY:19900501/);
  assert.match(vcf, /END:VCARD/);
});

test("parseVCard round-trips core fields", () => {
  const vcf = formatVCard(sample);
  const parsed = parseVCard(vcf);
  assert.ok(parsed);
  assert.equal(parsed!.uid, "contact-abc123");
  assert.equal(parsed!.firstName, "Remon");
  assert.equal(parsed!.lastName, "de Vries");
  assert.equal(parsed!.emails[0]?.address, "email@remondevries.com");
  assert.equal(parsed!.phones[0]?.number, "058 266 4242");
  assert.equal(parsed!.birthday, "1990-05-01");
  assert.equal(parsed!.city, "Leeuwarden");
});

test("parseVCard embeds PHOTO bytes", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const vcf = formatVCard(sample, { contentType: "image/jpeg", bytes });
  assert.match(vcf, /PHOTO;ENCODING=b;TYPE=JPEG:/);
  const parsed = parseVCard(vcf);
  assert.ok(parsed?.photo);
  assert.equal(parsed!.photo!.contentType, "image/jpeg");
  assert.deepEqual([...parsed!.photo!.bytes], [0xff, 0xd8, 0xff, 0xd9]);
});

test("contactEtag is stable for same updatedAt", () => {
  const a = contactEtag(sample);
  const b = contactEtag(sample);
  assert.equal(a, b);
  assert.match(a, /^"/);
});
