import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  BankAccount,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
} from "@backsteros/contracts";

import { entityKeyFromName, toSnakeFields } from "./entity-mutations";
import type { SyncedMetadataTable } from "./powersync-context";
import { shouldSkipRestEntityWrite } from "./powersync-write-path";

export type FinanceMetadataTable = Extract<
  SyncedMetadataTable,
  | "bank_accounts"
  | "financial_categories"
  | "financial_goals"
  | "financial_recurrings"
>;

export type MobileFinancePowerSync = {
  ready: boolean;
  connected: boolean;
  patchMetadata: (
    table: FinanceMetadataTable,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  createMetadata?: (
    table: FinanceMetadataTable,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
};

function financeApiPath(table: FinanceMetadataTable, id?: string): string {
  if (table === "bank_accounts") {
    return id
      ? `/api/v1/bank-accounts/${encodeURIComponent(id)}`
      : "/api/v1/bank-accounts";
  }
  if (table === "financial_categories") {
    return id
      ? `/api/v1/financial-categories/${encodeURIComponent(id)}`
      : "/api/v1/financial-categories";
  }
  if (table === "financial_goals") {
    return id
      ? `/api/v1/financial-goals/${encodeURIComponent(id)}`
      : "/api/v1/financial-goals";
  }
  return id
    ? `/api/v1/financial-recurrings/${encodeURIComponent(id)}`
    : "/api/v1/financial-recurrings";
}

function bankAccountApiToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "ibanOrMask") sqliteValues.iban_or_mask = value;
    else if (key === "avatarStorageKey") sqliteValues.avatar_storage_key = value;
    else if (key === "avatarContentType") {
      sqliteValues.avatar_content_type = value;
    } else if (key === "sortOrder") sqliteValues.sort_order = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

function categoryApiToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "parentId") sqliteValues.parent_id = value;
    else if (key === "budgetCents") sqliteValues.budget_cents = value;
    else if (key === "sortOrder") sqliteValues.sort_order = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

function goalApiToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "goalAmountCents") sqliteValues.goal_amount_cents = value;
    else if (key === "contributionCents") sqliteValues.contribution_cents = value;
    else if (key === "startDate") sqliteValues.start_date = value;
    else if (key === "endDate") sqliteValues.end_date = value;
    else if (key === "savingMode") sqliteValues.saving_mode = value;
    else if (key === "sortOrder") sqliteValues.sort_order = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

function recurringApiToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "categoryId") sqliteValues.category_id = value;
    else if (key === "amountCents") sqliteValues.amount_cents = value;
    else if (key === "nextDate") sqliteValues.next_date = value;
    else if (key === "archived") sqliteValues.archived = value ? 1 : 0;
    else if (key === "sortOrder") sqliteValues.sort_order = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

function apiToSqlite(
  table: FinanceMetadataTable,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (table === "bank_accounts") return bankAccountApiToSqlite(values);
  if (table === "financial_categories") return categoryApiToSqlite(values);
  if (table === "financial_goals") return goalApiToSqlite(values);
  return recurringApiToSqlite(values);
}

async function patchFinanceLocal(
  powerSync: MobileFinancePowerSync,
  table: FinanceMetadataTable,
  id: string,
  sqliteValues: Record<string, unknown>,
): Promise<void> {
  await powerSync.patchMetadata(table, id, sqliteValues);
}

export async function patchFinanceViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  table: FinanceMetadataTable,
  id: string,
  apiValues: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(apiValues).length === 0) return;

  const sqliteValues = apiToSqlite(table, apiValues);
  if (powerSync.ready && Object.keys(sqliteValues).length > 0) {
    try {
      await patchFinanceLocal(powerSync, table, id, sqliteValues);
    } catch {
      if (shouldSkipRestEntityWrite(powerSync)) {
        throw new Error(`Could not update ${table} locally.`);
      }
    }
  }

  if (shouldSkipRestEntityWrite(powerSync)) {
    return;
  }

  await client.requestJson(financeApiPath(table, id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(apiValues),
  });
}

function shouldCreateViaPowerSync(powerSync: MobileFinancePowerSync): boolean {
  return Boolean(powerSync.ready && powerSync.createMetadata);
}

export async function createBankAccountViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  input: {
    key?: string;
    name: string;
    ibanOrMask?: string | null;
    currency?: string;
    type?: string;
    sortOrder?: number;
  },
): Promise<BankAccount> {
  const name = input.name.trim();
  const key =
    input.key?.trim() ||
    `${entityKeyFromName(name, "bank")}${Math.floor(Math.random() * 90 + 10)}`;
  const body = {
    key,
    name,
    ibanOrMask: input.ibanOrMask ?? null,
    currency: input.currency ?? "EUR",
    type: input.type ?? "bank_account",
    sortOrder: input.sortOrder ?? Date.now(),
  };

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "bank_accounts",
      toSnakeFields(body),
    );
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      key: body.key,
      name: body.name,
      ibanOrMask: body.ibanOrMask,
      currency: body.currency,
      type: body.type as BankAccount["type"],
      avatarStorageKey: null,
      avatarContentType: null,
      color: null,
      sortOrder: body.sortOrder,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<BankAccount>("/api/v1/bank-accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateBankAccountViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<void> {
  await patchFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "bank_accounts",
    id,
    input,
  );
}

export async function deleteBankAccountViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  if (powerSync.ready) {
    await patchFinanceLocal(powerSync, "bank_accounts", id, {
      deleted_at: deletedAt,
    });
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
    try {
      await client.requestJson(financeApiPath("bank_accounts", id), {
        method: "DELETE",
      });
    } catch {
      /* local soft-delete queued */
    }
    return;
  }
  await client.requestJson(financeApiPath("bank_accounts", id), {
    method: "DELETE",
  });
}

export async function createFinancialCategoryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  input: Record<string, unknown>,
): Promise<FinancialCategory> {
  const body: Record<string, unknown> = {
    sortOrder: Date.now(),
    ...input,
  };

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "financial_categories",
      toSnakeFields(body),
    );
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      name: String(body.name ?? ""),
      parentId: (body.parentId as string | null | undefined) ?? null,
      kind: (body.kind as FinancialCategory["kind"]) ?? "expense",
      listing: (body.listing as FinancialCategory["listing"]) ?? "active",
      icon: (body.icon as string | null | undefined) ?? null,
      budgetCents: (body.budgetCents as number | null | undefined) ?? null,
      sortOrder: body.sortOrder as number,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<FinancialCategory>(
    financeApiPath("financial_categories"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function updateFinancialCategoryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<void> {
  await patchFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "financial_categories",
    id,
    input,
  );
}

export async function deleteFinancialCategoryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  if (powerSync.ready) {
    await patchFinanceLocal(powerSync, "financial_categories", id, {
      deleted_at: deletedAt,
    });
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
    try {
      await client.requestJson(financeApiPath("financial_categories", id), {
        method: "DELETE",
      });
    } catch {
      /* local soft-delete queued */
    }
    return;
  }
  await client.requestJson(financeApiPath("financial_categories", id), {
    method: "DELETE",
  });
}

export async function createFinancialGoalViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  input: Record<string, unknown>,
): Promise<FinancialGoal> {
  const body: Record<string, unknown> = {
    sortOrder: Date.now(),
    ...input,
  };

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "financial_goals",
      toSnakeFields(body),
    );
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      name: String(body.name ?? ""),
      listing: (body.listing as FinancialGoal["listing"]) ?? "active",
      icon: (body.icon as string | null | undefined) ?? null,
      goalAmountCents:
        (body.goalAmountCents as number | null | undefined) ?? null,
      startDate: (body.startDate as string | null | undefined) ?? null,
      endDate: (body.endDate as string | null | undefined) ?? null,
      contributionCents:
        (body.contributionCents as number | null | undefined) ?? null,
      savingMode: (body.savingMode as FinancialGoal["savingMode"]) ?? "monthly",
      sortOrder: body.sortOrder as number,
      savedCents: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<FinancialGoal>(financeApiPath("financial_goals"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateFinancialGoalViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<void> {
  await patchFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "financial_goals",
    id,
    input,
  );
}

export async function deleteFinancialGoalViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  if (powerSync.ready) {
    await patchFinanceLocal(powerSync, "financial_goals", id, {
      deleted_at: deletedAt,
    });
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
    try {
      await client.requestJson(financeApiPath("financial_goals", id), {
        method: "DELETE",
      });
    } catch {
      /* local soft-delete queued */
    }
    return;
  }
  await client.requestJson(financeApiPath("financial_goals", id), {
    method: "DELETE",
  });
}

export async function createFinancialRecurringViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  input: Record<string, unknown>,
): Promise<FinancialRecurring> {
  const body: Record<string, unknown> = {
    sortOrder: Date.now(),
    ...input,
  };

  if (shouldCreateViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata!(
      "financial_recurrings",
      toSnakeFields(body),
    );
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      name: String(body["name"] ?? ""),
      icon: (body["icon"] as string | null | undefined) ?? null,
      categoryId: (body["categoryId"] as string | null | undefined) ?? null,
      amountCents: (body["amountCents"] as number | null | undefined) ?? null,
      nextDate: (body["nextDate"] as string | null | undefined) ?? null,
      archived: Boolean(body["archived"]),
      sortOrder: body["sortOrder"] as number,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  return client.requestJson<FinancialRecurring>(
    financeApiPath("financial_recurrings"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function updateFinancialRecurringViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<void> {
  await patchFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "financial_recurrings",
    id,
    input,
  );
}

export async function deleteFinancialRecurringViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileFinancePowerSync,
  id: string,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  if (powerSync.ready) {
    await patchFinanceLocal(powerSync, "financial_recurrings", id, {
      deleted_at: deletedAt,
    });
    if (shouldSkipRestEntityWrite(powerSync)) {
      return;
    }
    try {
      await client.requestJson(financeApiPath("financial_recurrings", id), {
        method: "DELETE",
      });
    } catch {
      /* local soft-delete queued */
    }
    return;
  }
  await client.requestJson(financeApiPath("financial_recurrings", id), {
    method: "DELETE",
  });
}