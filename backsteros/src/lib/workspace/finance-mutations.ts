import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  BankAccount,
  CashflowPlannerEntry,
  CashflowPlannerEntryInput,
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
} from "@backsteros/contracts";

import { shouldSkipRestEntityWrite } from "./powersync-write-path";
import type { WorkspacePowerSync } from "./workspace-data-types";

export type FinanceMetadataTable =
  | "bank_accounts"
  | "financial_categories"
  | "financial_goals"
  | "financial_recurrings"
  | "cashflow_planner_entries";

function canWriteViaPowerSync(powerSync: WorkspacePowerSync): boolean {
  return shouldSkipRestEntityWrite(powerSync);
}

function toSnakeFields(values: Record<string, unknown>): Record<string, unknown> {
  const snake: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const snakeKey = key.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`,
    );
    if (value === true) snake[snakeKey] = 1;
    else if (value === false) snake[snakeKey] = 0;
    else snake[snakeKey] = value;
  }
  return snake;
}

function entityKeyFromName(name: string, fallback: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return base || fallback;
}

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
  if (table === "financial_recurrings") {
    return id
      ? `/api/v1/financial-recurrings/${encodeURIComponent(id)}`
      : "/api/v1/financial-recurrings";
  }
  return id
    ? `/api/v1/cashflow-planner-entries/${encodeURIComponent(id)}`
    : "/api/v1/cashflow-planner-entries";
}

async function patchFinanceViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  table: FinanceMetadataTable,
  id: string,
  apiValues: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(apiValues).length === 0) return;
  const sqliteValues = toSnakeFields(apiValues);
  if (canWriteViaPowerSync(powerSync) && Object.keys(sqliteValues).length > 0) {
    await powerSync.patchMetadata(table, id, sqliteValues);
    return;
  }
  await client.requestJson(financeApiPath(table, id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(apiValues),
  });
}

async function softDeleteFinanceViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  table: FinanceMetadataTable,
  id: string,
): Promise<void> {
  if (canWriteViaPowerSync(powerSync)) {
    await powerSync.patchMetadata(table, id, {
      deleted_at: new Date().toISOString(),
    });
    return;
  }
  await client.requestJson(financeApiPath(table, id), { method: "DELETE" });
}

export async function createBankAccountViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: {
    key?: string;
    name: string;
    ibanOrMask?: string | null;
    currency?: string;
    type?: string;
    moneybirdFinancialAccountId?: string | null;
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
    moneybirdFinancialAccountId: input.moneybirdFinancialAccountId ?? null,
    sortOrder: input.sortOrder ?? Date.now(),
  };

  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata("bank_accounts", toSnakeFields(body));
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
      moneybirdFinancialAccountId: body.moneybirdFinancialAccountId,
      moneybirdLastSyncedAt: null,
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
  powerSync: WorkspacePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<BankAccount | void> {
  if (canWriteViaPowerSync(powerSync)) {
    await patchFinanceViaPowerSyncOrApi(client, powerSync, "bank_accounts", id, input);
    return;
  }
  return client.requestJson<BankAccount>(financeApiPath("bank_accounts", id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteBankAccountViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  id: string,
): Promise<void> {
  await softDeleteFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "bank_accounts",
    id,
  );
}

export async function createFinancialCategoryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: Record<string, unknown>,
): Promise<FinancialCategory> {
  const body: Record<string, unknown> = { sortOrder: Date.now(), ...input };
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata(
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
  powerSync: WorkspacePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<FinancialCategory | void> {
  if (canWriteViaPowerSync(powerSync)) {
    await patchFinanceViaPowerSyncOrApi(
      client,
      powerSync,
      "financial_categories",
      id,
      input,
    );
    return;
  }
  return client.requestJson<FinancialCategory>(
    financeApiPath("financial_categories", id),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteFinancialCategoryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  id: string,
): Promise<void> {
  await softDeleteFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "financial_categories",
    id,
  );
}

export async function createFinancialGoalViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: Record<string, unknown>,
): Promise<FinancialGoal> {
  const body: Record<string, unknown> = { sortOrder: Date.now(), ...input };
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata(
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
  powerSync: WorkspacePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<FinancialGoal | void> {
  if (canWriteViaPowerSync(powerSync)) {
    await patchFinanceViaPowerSyncOrApi(
      client,
      powerSync,
      "financial_goals",
      id,
      input,
    );
    return;
  }
  return client.requestJson<FinancialGoal>(
    financeApiPath("financial_goals", id),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteFinancialGoalViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  id: string,
): Promise<void> {
  await softDeleteFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "financial_goals",
    id,
  );
}

export async function createFinancialRecurringViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: Record<string, unknown>,
): Promise<FinancialRecurring> {
  const body: Record<string, unknown> = { sortOrder: Date.now(), ...input };
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata(
      "financial_recurrings",
      toSnakeFields(body),
    );
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      name: String(body.name ?? ""),
      icon: (body.icon as string | null | undefined) ?? null,
      categoryId: (body.categoryId as string | null | undefined) ?? null,
      amountCents: (body.amountCents as number | null | undefined) ?? null,
      nextDate: (body.nextDate as string | null | undefined) ?? null,
      archived: Boolean(body.archived),
      sortOrder: body.sortOrder as number,
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
  powerSync: WorkspacePowerSync,
  id: string,
  input: Record<string, unknown>,
): Promise<FinancialRecurring | void> {
  if (canWriteViaPowerSync(powerSync)) {
    await patchFinanceViaPowerSyncOrApi(
      client,
      powerSync,
      "financial_recurrings",
      id,
      input,
    );
    return;
  }
  return client.requestJson<FinancialRecurring>(
    financeApiPath("financial_recurrings", id),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteFinancialRecurringViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  id: string,
): Promise<void> {
  await softDeleteFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "financial_recurrings",
    id,
  );
}

export async function createCashflowPlannerEntryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  input: CashflowPlannerEntryInput,
): Promise<CashflowPlannerEntry> {
  const body = {
    entryType: input.entryType ?? "expense",
    name: input.name ?? "New row",
    amountCents: input.amountCents ?? 0,
    dueDate: input.dueDate,
    groupLabel: input.groupLabel ?? null,
    sortOrder: input.sortOrder ?? Date.now(),
  };
  if (canWriteViaPowerSync(powerSync)) {
    const id = await powerSync.createMetadata(
      "cashflow_planner_entries",
      toSnakeFields(body),
    );
    const now = new Date().toISOString();
    return {
      id,
      workspaceId: "",
      entryType: body.entryType as CashflowPlannerEntry["entryType"],
      name: body.name,
      amountCents: body.amountCents,
      dueDate: body.dueDate,
      groupLabel: body.groupLabel,
      sortOrder: body.sortOrder,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }
  return client.requestJson<CashflowPlannerEntry>(
    financeApiPath("cashflow_planner_entries"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function updateCashflowPlannerEntryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  id: string,
  patch: Partial<CashflowPlannerEntryInput>,
): Promise<CashflowPlannerEntry | void> {
  if (canWriteViaPowerSync(powerSync)) {
    await patchFinanceViaPowerSyncOrApi(
      client,
      powerSync,
      "cashflow_planner_entries",
      id,
      patch as Record<string, unknown>,
    );
    return;
  }
  return client.requestJson<CashflowPlannerEntry>(
    financeApiPath("cashflow_planner_entries", id),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
}

export async function deleteCashflowPlannerEntryViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
  id: string,
): Promise<void> {
  await softDeleteFinanceViaPowerSyncOrApi(
    client,
    powerSync,
    "cashflow_planner_entries",
    id,
  );
}
