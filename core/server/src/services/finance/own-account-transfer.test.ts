import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertIncomeCategoryKind,
  bookedOnWithinDays,
  collectPendingMirrorCandidates,
  detectOwnAccountTransfer,
  isCounterpartyOwnAccount,
  isIncomeNamedCategory,
  isMirrorTransferPair,
  normalizeAccountRef,
} from "./own-account-transfer.js";

describe("normalizeAccountRef", () => {
  it("strips spaces/dashes and uppercases", () => {
    assert.equal(normalizeAccountRef("nl80 ingb-0008304884"), "NL80INGB0008304884");
    assert.equal(normalizeAccountRef("  "), null);
    assert.equal(normalizeAccountRef(null), null);
  });
});

describe("isCounterpartyOwnAccount", () => {
  const own = new Set(["NL80INGB0008304884", "NL43INGB0663319099"]);

  it("matches full IBAN against own accounts", () => {
    assert.equal(
      isCounterpartyOwnAccount("NL43 INGB 0663 3190 99", own),
      true,
    );
    assert.equal(
      isCounterpartyOwnAccount("NL00BUNQ0000000000", own),
      false,
    );
  });

  it("skips the source account ref", () => {
    assert.equal(
      isCounterpartyOwnAccount("NL80INGB0008304884", own, {
        excludeRef: "NL80INGB0008304884",
      }),
      false,
    );
  });
});

describe("isMirrorTransferPair", () => {
  it("matches ING Business debit with Amex Gold credit within a few days", () => {
    assert.equal(
      isMirrorTransferPair(
        {
          bankAccountId: "ing-business",
          amountCents: -64_553,
          bookedOn: "2026-07-27",
        },
        {
          bankAccountId: "amex-gold",
          amountCents: 64_553,
          bookedOn: "2026-07-27",
        },
      ),
      true,
    );
  });

  it("rejects same account, wrong amount, or dates outside the window", () => {
    assert.equal(
      isMirrorTransferPair(
        {
          bankAccountId: "a",
          amountCents: -100,
          bookedOn: "2026-07-27",
        },
        {
          bankAccountId: "a",
          amountCents: 100,
          bookedOn: "2026-07-27",
        },
      ),
      false,
    );
    assert.equal(
      isMirrorTransferPair(
        {
          bankAccountId: "a",
          amountCents: -100,
          bookedOn: "2026-07-27",
        },
        {
          bankAccountId: "b",
          amountCents: 99,
          bookedOn: "2026-07-27",
        },
      ),
      false,
    );
    assert.equal(
      bookedOnWithinDays("2026-07-27", "2026-07-31", 3),
      false,
    );
    assert.equal(
      isMirrorTransferPair(
        {
          bankAccountId: "a",
          amountCents: -100,
          bookedOn: "2026-07-27",
        },
        {
          bankAccountId: "b",
          amountCents: 100,
          bookedOn: "2026-07-31",
        },
      ),
      false,
    );
  });
});

describe("detectOwnAccountTransfer", () => {
  const own = new Set(["NL80INGB0008304884", "NL43INGB0663319099"]);

  it("prefers own-IBAN over payee heuristic", () => {
    assert.equal(
      detectOwnAccountTransfer({
        counterparty: "NL43INGB0663319099",
        payee: "LINEAR.APP",
        amountCents: -50_00,
        bankAccountId: "ing-business",
        bookedOn: "2026-07-27",
        ownAccountRefs: own,
        sourceAccountRef: "NL80INGB0008304884",
      }),
      "own_iban",
    );
  });

  it("detects mirror pairs before falling back to payee", () => {
    assert.equal(
      detectOwnAccountTransfer({
        counterparty: "NL63DEUT0265188040",
        payee: "American Express Europe SA Netherlands Branch",
        amountCents: -64_553,
        bankAccountId: "ing-business",
        bookedOn: "2026-07-27",
        ownAccountRefs: own,
        sourceAccountRef: "NL80INGB0008304884",
        mirrorCandidates: [
          {
            bankAccountId: "amex-gold",
            amountCents: 64_553,
            bookedOn: "2026-07-27",
          },
        ],
      }),
      "mirror_pair",
    );
  });

  it("falls back to payee heuristic for Amex thank-you credits", () => {
    assert.equal(
      detectOwnAccountTransfer({
        counterparty: null,
        payee: "HARTELIJK BEDANKT VOOR UW BETALING",
        amountCents: 64_553,
        bankAccountId: "amex-gold",
        bookedOn: "2026-07-27",
        ownAccountRefs: own,
      }),
      "payee_heuristic",
    );
  });

  it("returns null for ordinary merchants", () => {
    assert.equal(
      detectOwnAccountTransfer({
        counterparty: "NL00BANK0123456789",
        payee: "LINEAR.APP COVINA",
        amountCents: -28_59,
        bankAccountId: "ing-business",
        bookedOn: "2026-07-27",
        ownAccountRefs: own,
      }),
      null,
    );
  });

  it("matches opposite amounts inside a pending import batch", () => {
    const pending = [
      {
        id: "1",
        bankAccountId: "ing-business",
        amountCents: -64_553,
        bookedOn: "2026-07-27",
      },
      {
        id: "2",
        bankAccountId: "amex-gold",
        amountCents: 64_553,
        bookedOn: "2026-07-27",
      },
    ];
    assert.equal(collectPendingMirrorCandidates(pending, pending[0]!).length, 1);
    assert.equal(
      detectOwnAccountTransfer({
        ...pending[0]!,
        counterparty: null,
        payee: "Something",
        ownAccountRefs: own,
        mirrorCandidates: collectPendingMirrorCandidates(pending, pending[0]!),
      }),
      "mirror_pair",
    );
  });
});

describe("income category kind guard", () => {
  it("flags Income-named categories", () => {
    assert.equal(isIncomeNamedCategory("Income"), true);
    assert.equal(isIncomeNamedCategory("Income Personal"), true);
    assert.equal(isIncomeNamedCategory("Lemo-Design"), false);
  });

  it("rejects kind=expense for Income-named categories", () => {
    assert.throws(
      () => assertIncomeCategoryKind("Income", "expense"),
      /CATEGORY_INCOME_KIND_MISMATCH/,
    );
    assert.doesNotThrow(() => assertIncomeCategoryKind("Income", "income"));
    assert.doesNotThrow(() => assertIncomeCategoryKind("Other", "expense"));
  });
});
