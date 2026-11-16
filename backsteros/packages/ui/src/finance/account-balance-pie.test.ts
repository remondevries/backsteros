import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildAccountBalancePie } from "./account-balance-pie.js";

describe("buildAccountBalancePie", () => {
  test("excludes negative balances from the magnitude pie but keeps signed total", () => {
    const result = buildAccountBalancePie({
      accounts: [
        {
          id: "checking",
          label: "Checking",
          balanceCents: 500_00,
          color: "#111",
        },
        {
          id: "card",
          label: "Credit card",
          balanceCents: -200_00,
          color: "#222",
        },
        {
          id: "savings",
          label: "Savings",
          balanceCents: 100_00,
          color: "#333",
        },
      ],
    });

    assert.equal(result.totalCents, 400_00);
    assert.deepEqual(
      result.slices.map((slice) => slice.id),
      ["checking", "savings"],
    );
    assert.equal(
      result.slices.every((slice) => slice.value > 0),
      true,
    );
  });
});
