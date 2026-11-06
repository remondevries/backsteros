import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUNQ_PERSONAL_BANK_ACCOUNT_KEY,
  BUNQ_PERSONAL_BANK_ACCOUNT_NAME,
} from "./bunq-personal-bank-account.js";

describe("bunq personal bank account", () => {
  it("uses a stable Finance key and display name", () => {
    assert.equal(BUNQ_PERSONAL_BANK_ACCOUNT_KEY, "bunq-personal");
    assert.equal(BUNQ_PERSONAL_BANK_ACCOUNT_NAME, "Bunq Personal");
  });
});
