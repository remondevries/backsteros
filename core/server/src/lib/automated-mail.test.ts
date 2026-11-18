import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractEmailAddress,
  isAutomatedMailSkipStatus,
} from "./automated-mail.js";

describe("automated-mail", () => {
  it("extracts addresses from angle-bracket From lines", () => {
    assert.equal(
      extractEmailAddress("Client <client@pa-mu.test>"),
      "client@pa-mu.test",
    );
    assert.equal(extractEmailAddress("client@pa-mu.test"), "client@pa-mu.test");
  });

  it("detects out-of-office and bounce senders", () => {
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "Client <client@pa-mu.test>",
        headers: { "Auto-Submitted": "auto-replied" },
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "MAILER-DAEMON@mail.example",
      }),
      true,
    );
    assert.equal(
      isAutomatedMailSkipStatus({
        from: "Client <client@pa-mu.test>",
        headers: { "Auto-Submitted": "no" },
      }),
      false,
    );
  });
});
