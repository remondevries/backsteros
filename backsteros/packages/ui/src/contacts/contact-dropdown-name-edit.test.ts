import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  contactDropdownNameEditModeAfterCommit,
  contactDropdownNameEditShowsPencil,
  resolveContactNameEditFields,
  splitContactDisplayName,
} from "./contact-dropdown-name-edit.js";
import { ContactDropdownNameEditRow } from "../components/contacts/contact-dropdown-name-edit-row.js";

describe("splitContactDisplayName", () => {
  it("splits first and remaining last parts", () => {
    assert.deepEqual(splitContactDisplayName("Ada Lovelace"), {
      firstName: "Ada",
      lastName: "Lovelace",
    });
    assert.deepEqual(splitContactDisplayName("  Mary Ann Evans  "), {
      firstName: "Mary",
      lastName: "Ann Evans",
    });
  });

  it("handles empty and single-token names", () => {
    assert.deepEqual(splitContactDisplayName(null), {
      firstName: "",
      lastName: "",
    });
    assert.deepEqual(splitContactDisplayName("Prince"), {
      firstName: "Prince",
      lastName: "",
    });
  });
});

describe("resolveContactNameEditFields", () => {
  it("prefers explicit CRM first/last fields", () => {
    assert.deepEqual(
      resolveContactNameEditFields({
        firstName: "Ada",
        lastName: "Lovelace",
        displayName: "Ignored Name",
      }),
      { firstName: "Ada", lastName: "Lovelace" },
    );
  });

  it("does not duplicate a surname when firstName already holds the full name", () => {
    assert.deepEqual(
      resolveContactNameEditFields({
        firstName: "Brandon Small",
        lastName: null,
        displayName: "Brandon Small",
      }),
      { firstName: "Brandon Small", lastName: "" },
    );
  });

  it("derives from display name when CRM fields are missing", () => {
    assert.deepEqual(
      resolveContactNameEditFields({
        firstName: null,
        lastName: null,
        displayName: "Grace Hopper",
      }),
      { firstName: "Grace", lastName: "Hopper" },
    );
  });
});

describe("contactDropdownNameEditShowsPencil", () => {
  it("shows the pencil only for a linked contact in dropdown mode", () => {
    assert.equal(
      contactDropdownNameEditShowsPencil({
        contactId: "c1",
        mode: "dropdown",
      }),
      true,
    );
    assert.equal(
      contactDropdownNameEditShowsPencil({
        contactId: "c1",
        mode: "editing",
      }),
      false,
    );
    assert.equal(
      contactDropdownNameEditShowsPencil({
        contactId: null,
        mode: "dropdown",
      }),
      false,
    );
  });
});

describe("contactDropdownNameEditModeAfterCommit", () => {
  it("returns to the dropdown after save or cancel", () => {
    assert.equal(contactDropdownNameEditModeAfterCommit(), "dropdown");
  });
});

describe("ContactDropdownNameEditRow", () => {
  it("renders the dropdown and a hover pencil for a linked contact", () => {
    const html = renderToStaticMarkup(
      createElement(ContactDropdownNameEditRow, {
        contactId: "c1",
        contactName: "Ada Lovelace",
        firstName: "Ada",
        lastName: "Lovelace",
        dropdown: createElement("button", { type: "button" }, "Ada Lovelace"),
        onSaveFirstName: () => ({ ok: true as const }),
        onSaveLastName: () => ({ ok: true as const }),
      }),
    );
    assert.match(html, /contact-dropdown-name-edit--linked/);
    assert.match(html, /contact-dropdown-name-edit__pencil/);
    assert.match(html, /Edit contact name/);
    assert.match(html, /Ada Lovelace/);
    assert.doesNotMatch(html, /contact-dropdown-name-edit--editing/);
  });

  it("hides the pencil when no contact is linked", () => {
    const html = renderToStaticMarkup(
      createElement(ContactDropdownNameEditRow, {
        contactId: null,
        contactName: null,
        dropdown: createElement("button", { type: "button" }, "Select contact"),
        onSaveFirstName: () => ({ ok: true as const }),
        onSaveLastName: () => ({ ok: true as const }),
      }),
    );
    assert.doesNotMatch(html, /contact-dropdown-name-edit__pencil/);
    assert.doesNotMatch(html, /contact-dropdown-name-edit--linked/);
  });
});
