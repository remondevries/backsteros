import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertIncomeCategoryKind,
  bookedOnWithinDays,
  collectPendingMirrorCandidates,
  defaultKindForCategoryName,
  detectOwnAccountTransfer,
  isCounterpartyOwnAccount,
  isEligibleMirrorCounterpart,
  isIncomeNamedCategory,
  isMirrorTransferPair,
  normalizeAccountRef,
  pickTransferCategoryId,
  selectMirrorCounterpart,
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
  });
});

describe("tightened mirror-pair detection (A2)", () => {
  const own = new Set(["NL80INGB0008304884", "NL43INGB0663319099"]);

  it("rejects Mercedes lease −570.81 vs internal Lemo-Design transfer (no IBAN/payee confirm)", () => {
    const mirror = selectMirrorCounterpart(
      {
        id: "mercedes",
        bankAccountId: "ing-business",
        amountCents: -57_081,
        bookedOn: "2025-10-20",
        payee: "Mercedes-Benz Financial Services",
        counterparty: "NL00MBFS0000000001",
      },
      [
        {
          id: "lemo-transfer",
          bankAccountId: "bank24",
          amountCents: 57_081,
          bookedOn: "2025-10-20",
          payee: "Lemo-Design",
          counterparty: null,
          categoryKind: "transfer",
          categoryId: "cat-transfer",
        },
      ],
      own,
      { sourceAccountRef: "NL80INGB0008304884" },
    );
    assert.equal(mirror, null);
  });

  it("rejects restaurant CCV*Anne&Max −42.35 vs client Jansen +42.35", () => {
    const mirror = selectMirrorCounterpart(
      {
        id: "anne",
        bankAccountId: "amex-gold",
        amountCents: -4_235,
        bookedOn: "2025-08-16",
        payee: "CCV*Anne&Max",
        counterparty: null,
      },
      [
        {
          id: "jansen",
          bankAccountId: "ing-business",
          amountCents: 4_235,
          bookedOn: "2025-08-16",
          payee: "Jansen Hoveniers",
          counterparty: "NL00BANK0123456789",
          categoryKind: "income",
          categoryId: "cat-income",
        },
      ],
      own,
    );
    assert.equal(mirror, null);
  });

  it("rejects Thuisbezorgd −24.20 vs BTA invoice +24.20", () => {
    assert.equal(
      detectOwnAccountTransfer({
        id: "thuis",
        bankAccountId: "bank24",
        amountCents: -2_420,
        bookedOn: "2025-03-12",
        payee: "Thuisbezorgd.nl",
        counterparty: null,
        ownAccountRefs: own,
        mirrorCandidates: [
          {
            id: "bta",
            bankAccountId: "ing-business",
            amountCents: 2_420,
            bookedOn: "2025-03-13",
            payee: "BTA Diensten",
            categoryKind: "income",
            categoryId: "cat-income",
          },
        ],
      }),
      null,
    );
  });

  it("rejects Albert Heijn −10.29 vs Reset4U +10.29", () => {
    assert.equal(
      selectMirrorCounterpart(
        {
          id: "ah",
          bankAccountId: "bank24",
          amountCents: -1_029,
          bookedOn: "2024-07-12",
          payee: "Albert Heijn 1234",
        },
        [
          {
            id: "r4u",
            bankAccountId: "ing-business",
            amountCents: 1_029,
            bookedOn: "2024-07-12",
            payee: "Reset4U",
            categoryKind: "income",
            categoryId: "cat-income",
          },
        ],
        own,
      ),
      null,
    );
  });

  it("rejects Belastingdienst tax payments vs coincidental opposite amounts", () => {
    assert.equal(
      selectMirrorCounterpart(
        {
          id: "tax",
          bankAccountId: "bank24",
          amountCents: -227_600,
          bookedOn: "2022-07-01",
          payee: "Belastingdienst",
        },
        [
          {
            id: "other",
            bankAccountId: "ing-business",
            amountCents: 227_600,
            bookedOn: "2022-07-02",
            payee: "Some client",
            categoryKind: "income",
            categoryId: "cat-income",
          },
        ],
        own,
      ),
      null,
    );
  });

  it("rejects Allison foreign-IBAN leg and pairs Prive with the real Lemo-Design +€50 (A1)", () => {
    const bank24Ref = "NL43INGB0663319099";
    const allisonForeign = "NL05ADYB0123456789";
    const accountRefById = new Map<string, string | null>([
      ["ing-business", "NL80INGB0008304884"],
      ["bank24", bank24Ref],
    ]);
    const mirror = selectMirrorCounterpart(
      {
        id: "prive",
        bankAccountId: "ing-business",
        amountCents: -5_000,
        bookedOn: "2025-06-01",
        payee: "Prive",
        counterparty: bank24Ref,
      },
      [
        {
          id: "allison",
          bankAccountId: "bank24",
          amountCents: 5_000,
          bookedOn: "2025-06-01",
          payee: "Allison James Photography",
          counterparty: allisonForeign,
          categoryKind: "income",
          categoryId: "cat-income",
        },
        {
          id: "lemo-50",
          bankAccountId: "bank24",
          amountCents: 5_000,
          bookedOn: "2025-06-01",
          payee: "Lemo-Design",
          counterparty: null,
          categoryId: null,
        },
      ],
      own,
      {
        sourceAccountRef: "NL80INGB0008304884",
        accountRefById,
      },
    );
    assert.equal(mirror?.id, "lemo-50");
  });

  it("rejects Belastingdienst −€2,276 with tax IBAN vs uncategorized savings credit (A1 worst case)", () => {
    const taxIban = "NL86INGB0002445588";
    assert.equal(
      selectMirrorCounterpart(
        {
          id: "tax-2276",
          bankAccountId: "bank24",
          amountCents: -227_600,
          bookedOn: "2025-01-15",
          payee: "Belastingdienst",
          counterparty: taxIban,
        },
        [
          {
            id: "lemo-savings",
            bankAccountId: "ing-business",
            amountCents: 227_600,
            bookedOn: "2025-01-15",
            payee: "Lemo-Design",
            counterparty: null,
            categoryId: null,
          },
        ],
        own,
        {
          sourceAccountRef: "NL43INGB0663319099",
          accountRefById: new Map([
            ["bank24", "NL43INGB0663319099"],
            ["ing-business", "NL80INGB0008304884"],
          ]),
        },
      ),
      null,
    );
  });

  it("skips voided/refused settlement counterparts", () => {
    assert.equal(
      isEligibleMirrorCounterpart(
        { amountCents: -50_000, payee: "X" },
        {
          bankAccountId: "b",
          amountCents: 50_000,
          bookedOn: "2026-01-01",
          categoryId: null,
          settlementState: "refused",
        },
        own,
      ),
      false,
    );
  });

  it("pairs 1:1 preferring the closest date and consuming the counterpart", () => {
    const used = new Set<string>();
    const first = selectMirrorCounterpart(
      {
        id: "debit-1",
        bankAccountId: "ing-business",
        amountCents: -64_553,
        bookedOn: "2026-07-27",
        payee: "American Express Europe SA",
      },
      [
        {
          id: "credit-far",
          bankAccountId: "amex-gold",
          amountCents: 64_553,
          bookedOn: "2026-07-29",
          payee: "HARTELIJK BEDANKT VOOR UW BETALING",
          categoryId: null,
        },
        {
          id: "credit-near",
          bankAccountId: "amex-gold",
          amountCents: 64_553,
          bookedOn: "2026-07-27",
          payee: "HARTELIJK BEDANKT VOOR UW BETALING",
          categoryId: null,
        },
      ],
      own,
      { usedCandidateIds: used },
    );
    assert.equal(first?.id, "credit-near");
    used.add(first!.id!);
    const second = selectMirrorCounterpart(
      {
        id: "debit-2",
        bankAccountId: "ing-business",
        amountCents: -64_553,
        bookedOn: "2026-07-28",
        payee: "American Express Europe SA",
      },
      [
        {
          id: "credit-far",
          bankAccountId: "amex-gold",
          amountCents: 64_553,
          bookedOn: "2026-07-29",
          payee: "HARTELIJK BEDANKT VOOR UW BETALING",
          categoryId: null,
        },
        {
          id: "credit-near",
          bankAccountId: "amex-gold",
          amountCents: 64_553,
          bookedOn: "2026-07-27",
          payee: "HARTELIJK BEDANKT VOOR UW BETALING",
          categoryId: null,
        },
      ],
      own,
      { usedCandidateIds: used },
    );
    assert.equal(second?.id, "credit-far");
  });

  it("still matches Amex card payment via payee heuristic when counterparty IBAN is Amex (not own)", () => {
    assert.equal(
      detectOwnAccountTransfer({
        id: "ing-amex",
        bankAccountId: "ing-business",
        amountCents: -64_553,
        bookedOn: "2026-07-27",
        payee: "American Express Europe SA Netherlands Branch",
        counterparty: "NL63DEUT0265188040",
        ownAccountRefs: own,
        sourceAccountRef: "NL80INGB0008304884",
        mirrorCandidates: [
          {
            id: "amex-credit",
            bankAccountId: "amex-gold",
            amountCents: 64_553,
            bookedOn: "2026-07-27",
            payee: "HARTELIJK BEDANKT VOOR UW BETALING",
            categoryKind: "expense",
            categoryId: "cat-other",
          },
        ],
      }),
      "payee_heuristic",
    );
  });

  it("matches uncategorized opposite amounts above the small-amount floor", () => {
    assert.equal(
      detectOwnAccountTransfer({
        id: "a",
        bankAccountId: "ing-business",
        amountCents: -150_00,
        bookedOn: "2026-07-27",
        payee: "Internal move",
        ownAccountRefs: own,
        mirrorCandidates: [
          {
            id: "b",
            bankAccountId: "bank24",
            amountCents: 150_00,
            bookedOn: "2026-07-27",
            payee: "From business",
            categoryId: null,
          },
        ],
      }),
      "mirror_pair",
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

  it("matches opposite amounts inside a pending import batch when uncategorized", () => {
    const pending = [
      {
        id: "1",
        bankAccountId: "ing-business",
        amountCents: -150_00,
        bookedOn: "2026-07-27",
        payee: "Move",
        categoryId: null as string | null,
      },
      {
        id: "2",
        bankAccountId: "amex-gold",
        amountCents: 150_00,
        bookedOn: "2026-07-27",
        payee: "Move",
        categoryId: null as string | null,
      },
    ];
    assert.equal(collectPendingMirrorCandidates(pending, pending[0]!).length, 1);
    assert.equal(
      detectOwnAccountTransfer({
        ...pending[0]!,
        counterparty: null,
        ownAccountRefs: own,
        mirrorCandidates: collectPendingMirrorCandidates(pending, pending[0]!),
      }),
      "mirror_pair",
    );
  });
});

describe("income category kind guard (A12)", () => {
  it("matches Income and Income Personal, not Income tax", () => {
    assert.equal(isIncomeNamedCategory("Income"), true);
    assert.equal(isIncomeNamedCategory("Income Personal"), true);
    assert.equal(isIncomeNamedCategory("Income tax"), false);
    assert.equal(isIncomeNamedCategory("Income Taxes"), false);
    assert.equal(isIncomeNamedCategory("Income Tax Personal"), false);
    assert.equal(isIncomeNamedCategory("Income protection"), false);
    assert.equal(isIncomeNamedCategory("Lemo-Design"), false);
  });

  it("rejects kind=expense for Income-named categories", () => {
    assert.throws(
      () => assertIncomeCategoryKind("Income", "expense"),
      /CATEGORY_INCOME_KIND_MISMATCH/,
    );
    assert.doesNotThrow(() => assertIncomeCategoryKind("Income", "income"));
    assert.doesNotThrow(() => assertIncomeCategoryKind("Income tax", "expense"));
    assert.doesNotThrow(() => assertIncomeCategoryKind("Other", "expense"));
  });

  it("defaults kind=income for Income-named creates", () => {
    assert.equal(defaultKindForCategoryName("Income"), "income");
    assert.equal(defaultKindForCategoryName("Income Personal"), "income");
    assert.equal(defaultKindForCategoryName("Income tax"), "expense");
    assert.equal(defaultKindForCategoryName("Other", "transfer"), "transfer");
  });
});

describe("pickTransferCategoryId", () => {
  const rows = [
    { id: "transfer", name: "Transfer", parentId: null },
    { id: "cc-pay", name: "Creditcard payments", parentId: "transfer" },
    { id: "amex", name: "Amex", parentId: "transfer" },
  ];

  it("resolves bank↔bank to Transfer, not Creditcard payments", () => {
    assert.equal(
      pickTransferCategoryId(rows, {
        bankAccountType: "checking",
        counterpartAccountType: "savings",
      }),
      "transfer",
    );
  });

  it("resolves card involvement to Creditcard payments", () => {
    assert.equal(
      pickTransferCategoryId(rows, {
        bankAccountType: "checking",
        counterpartAccountType: "credit_card",
      }),
      "cc-pay",
    );
  });

  it("prefers account-named transfer children when hints match", () => {
    assert.equal(
      pickTransferCategoryId(rows, {
        bankAccountName: "Amex Gold",
        bankAccountType: "credit_card",
      }),
      "amex",
    );
  });
});
