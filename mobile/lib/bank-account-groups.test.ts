import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupBankAccounts } from "./bank-account-groups";

const account = (id: string, name: string, type: string) => ({
  id,
  name,
  type,
});

describe("groupBankAccounts", () => {
  it("groups by type in desktop order and sorts by name", () => {
    const groups = groupBankAccounts([
      account("1", "Zeta Checking", "bank_account"),
      account("2", "Alpha Checking", "bank_account"),
      account("3", "Amex", "credit_card"),
      account("4", "DeGiro", "investment"),
      account("5", "Buffer", "savings"),
    ]);

    assert.deepEqual(
      groups.map((group) => group.id),
      ["credit_cards", "savings", "investments", "bank_accounts"],
    );
    assert.deepEqual(
      groups.at(-1)!.accounts.map((entry) => entry.name),
      ["Alpha Checking", "Zeta Checking"],
    );
  });

  it("drops empty groups", () => {
    const groups = groupBankAccounts([account("1", "Main", "bank_account")]);
    assert.deepEqual(
      groups.map((group) => group.id),
      ["bank_accounts"],
    );
  });

  it("treats unknown types as bank accounts", () => {
    const groups = groupBankAccounts([account("1", "Odd", "mystery")]);
    assert.equal(groups[0]!.id, "bank_accounts");
  });
});
