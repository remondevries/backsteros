import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTACT_CARD_SECTION_IDS_ATTR,
  isContactCardSectionAttrVisible,
  readContactCardSectionIdsFromDom,
} from "./contact-sections.js";

test("isContactCardSectionAttrVisible skips keep-alive-hidden ancestors", () => {
  const previousDocument = globalThis.document;
  const hiddenRoot = {
    closest: (selector: string) =>
      selector === "[data-keep-alive-hidden]" ? hiddenRoot : null,
    getAttribute: () => null,
  } as unknown as Element;
  const visible = {
    closest: () => null,
    getAttribute: () => null,
  } as unknown as Element;

  try {
    assert.equal(isContactCardSectionAttrVisible(hiddenRoot), false);
    assert.equal(isContactCardSectionAttrVisible(visible), true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("readContactCardSectionIdsFromDom prefers a visible card over a frozen one", () => {
  const previousDocument = globalThis.document;
  const frozen = {
    closest: (selector: string) =>
      selector === "[data-keep-alive-hidden]" ? frozen : null,
    getAttribute: (name: string) =>
      name === CONTACT_CARD_SECTION_IDS_ATTR
        ? "conversation,overview,details"
        : null,
  };
  const visible = {
    closest: () => null,
    getAttribute: (name: string) =>
      name === CONTACT_CARD_SECTION_IDS_ATTR ? "overview,details,portal" : null,
  };

  globalThis.document = {
    querySelectorAll: () => [frozen, visible] as unknown as NodeListOf<Element>,
  } as unknown as Document;

  try {
    assert.deepEqual(readContactCardSectionIdsFromDom(), [
      "overview",
      "details",
      "portal",
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("readContactCardSectionIdsFromDom falls back when only frozen attrs exist", () => {
  const previousDocument = globalThis.document;
  const frozen = {
    closest: (selector: string) =>
      selector === "[data-keep-alive-hidden]" ? frozen : null,
    getAttribute: (name: string) =>
      name === CONTACT_CARD_SECTION_IDS_ATTR
        ? "conversation,overview,details"
        : null,
  };

  globalThis.document = {
    querySelectorAll: () => [frozen] as unknown as NodeListOf<Element>,
  } as unknown as Document;

  try {
    assert.deepEqual(readContactCardSectionIdsFromDom(), [
      "overview",
      "details",
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});
