/**
 * Finance / Moneybird / bank-account routes (OS-73 split from routes.ts).
 */
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  bankAccountInputSchema,
  bankAccountCashflowQuerySchema,
  bankAccountsMonthIncomeQuerySchema,
  workspaceCashflowQuerySchema,
  financeSpendPanelQuerySchema,
  financeAssetsDebtQuerySchema,
  batchUpdateFinancialTransactionsSchema,
  batchDeleteFinancialTransactionsSchema,
  financialCategoryInputSchema,
  financialGoalInputSchema,
  financialRecurringInputSchema,
  cashflowPlannerEntryInputSchema,
  listFinancialTransactionsQuerySchema,
  updateBankAccountSchema,
  updateFinancialCategorySchema,
  updateFinancialGoalSchema,
  updateFinancialRecurringSchema,
  updateCashflowPlannerEntrySchema,
  updateFinancialTransactionSchema,
  moneybirdInvoiceRevenueQuerySchema,
  moneybirdBankAccountSyncQuerySchema,
} from "@backsteros/contracts";

import {
  toBankAccount,
  toFinancialCategory,
  toFinancialGoal,
  toFinancialRecurring,
  toCashflowPlannerEntry,
  toFinancialImportBatch,
  toFinancialTransaction,
} from "../lib/mappers.js";
import { MoneybirdApiError } from "../lib/moneybird-client.js";
import { newId } from "../lib/crypto.js";
import * as financeService from "../services/finance/finance.js";
import * as moneybirdBankSyncService from "../services/finance/moneybird-sync.js";
import * as moneybirdSettingsService from "../services/moneybird-settings.js";
import {
  recordBankAccountRestSyncEvent,
  recordCashflowPlannerRestSyncEvent,
  recordFinancialCategoryRestSyncEvent,
  recordFinancialGoalRestSyncEvent,
  recordFinancialRecurringRestSyncEvent,
  recordFinancialTransactionRestSyncEvent,
} from "../services/sync.js";
import {
  buildBankAccountRestPayload,
  buildCashflowPlannerRestPayload,
  buildFinancialCategoryRestPayload,
  buildFinancialGoalRestPayload,
  buildFinancialRecurringRestPayload,
  buildFinancialTransactionRestPayload,
  commitRestEntityWrite,
  commitRestEntityWriteBatch,
  isRestLeaderFirstWrite,
} from "../services/rest-leader-write.js";
import { MAX_UPLOAD_BYTES } from "../lib/upload-limits.js";
import {
  can,
  forbidden,
  getAuth,
  notFound,
  nudgePeerEntityLive,
} from "./route-helpers.js";

export function registerFinanceRoutes(app: Hono) {
  app.get("/api/v1/finance/moneybird/invoices/:invoiceId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const invoiceId = c.req.param("invoiceId")?.trim() ?? "";
    if (!invoiceId) {
      return c.json({ error: "Invoice id is required", code: "bad_request" }, 400);
    }
    try {
      return c.json(
        await moneybirdSettingsService.getMoneybirdSalesInvoiceDetail(
          auth.workspaceId,
          invoiceId,
        ),
      );
    } catch (error) {
      if (error instanceof MoneybirdApiError && error.status === 404) {
        return c.json({ error: "Invoice not found", code: "not_found" }, 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Could not load Moneybird invoice";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.get("/api/v1/finance/moneybird/contacts/:contactId", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read") && !can(auth, "organizations:read")) {
      return c.json(forbidden(), 403);
    }
    const contactId = c.req.param("contactId")?.trim() ?? "";
    if (!contactId) {
      return c.json({ error: "Contact id is required", code: "bad_request" }, 400);
    }
    try {
      return c.json(
        await moneybirdSettingsService.getMoneybirdContact(
          auth.workspaceId,
          contactId,
        ),
      );
    } catch (error) {
      if (error instanceof MoneybirdApiError && error.status === 404) {
        return c.json({ error: "Contact not found", code: "not_found" }, 404);
      }
      const message =
        error instanceof Error
          ? error.message
          : "Could not load Moneybird contact";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.get(
    "/api/v1/finance/moneybird/invoice-revenue",
    zValidator("query", moneybirdInvoiceRevenueQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const year = c.req.valid("query").year ?? new Date().getFullYear();
      try {
        const revenue =
          await moneybirdSettingsService.getMoneybirdInvoiceRevenue(
            auth.workspaceId,
            year,
          );
        return c.json(revenue);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load Moneybird invoice revenue";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
  app.get("/api/v1/finance/moneybird/financial-accounts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    try {
      const financialAccounts =
        await moneybirdSettingsService.listMoneybirdFinancialAccounts(
          auth.workspaceId,
        );
      return c.json({ financialAccounts });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not list Moneybird financial accounts";
      return c.json({ error: message, code: "bad_request" }, 400);
    }
  });
  app.get("/api/v1/bank-accounts", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listBankAccounts(auth.workspaceId);
    return c.json({ bankAccounts: rows.map(toBankAccount) });
  });
  app.get("/api/v1/bank-accounts/balances", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const balances = await financeService.listBankAccountBalances(
      auth.workspaceId,
    );
    return c.json({ balances });
  });
  app.get(
    "/api/v1/finance/assets-debt",
    zValidator("query", financeAssetsDebtQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const range = c.req.valid("query").range ?? "1M";
      const series = await financeService.getFinanceAssetsDebt(
        auth.workspaceId,
        range,
      );
      return c.json(series);
    },
  );
  app.get(
    "/api/v1/bank-accounts/month-income",
    zValidator("query", bankAccountsMonthIncomeQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const month =
        c.req.valid("query").month ??
        (() => {
          const now = new Date();
          return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        })();
      const result = await financeService.getBankAccountsMonthIncome(
        auth.workspaceId,
        month,
      );
      return c.json(result);
    },
  );
  app.get(
    "/api/v1/bank-accounts/:id/cashflow",
    zValidator("query", bankAccountCashflowQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const year =
        c.req.valid("query").year ?? new Date().getFullYear();
      const cashflow = await financeService.getBankAccountCashflow(
        auth.workspaceId,
        c.req.param("id"),
        year,
      );
      return cashflow
        ? c.json(cashflow)
        : c.json(notFound("Bank account"), 404);
    },
  );
  app.get(
    "/api/v1/finance/cashflow",
    zValidator("query", workspaceCashflowQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const year = query.year ?? new Date().getFullYear();
      const cashflow = await financeService.getWorkspaceCashflow(
        auth.workspaceId,
        year,
        query.asOf,
      );
      return c.json(cashflow);
    },
  );
  app.get(
    "/api/v1/finance/spend-panel",
    zValidator("query", financeSpendPanelQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const panel = await financeService.getFinanceSpendPanel(
        auth.workspaceId,
        query.month,
        query.historyMonths,
      );
      return c.json(panel);
    },
  );
  app.get("/api/v1/bank-accounts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const row = await financeService.getBankAccountById(
      auth.workspaceId,
      c.req.param("id"),
    );
    return row ? c.json(toBankAccount(row)) : c.json(notFound("Bank account"), 404);
  });
  app.post(
    "/api/v1/bank-accounts",
    zValidator("json", bankAccountInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const accountId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "bank_account",
          entityId: accountId,
          operation: "upsert",
          payload: buildBankAccountRestPayload(accountId, body),
        });
        const row = await financeService.getBankAccountById(
          auth.workspaceId,
          accountId,
        );
        if (!row) {
          return c.json(
            { error: "Bank account create failed", code: "internal" },
            500,
          );
        }
        nudgePeerEntityLive(auth, "bank_account", row.id, "upsert");
        return c.json(toBankAccount(row), 201);
      }
      const row = await financeService.createBankAccount(
        auth.workspaceId,
        body,
      );
      await recordBankAccountRestSyncEvent(auth.workspaceId, row, "upsert");
      nudgePeerEntityLive(auth, "bank_account", row.id, "upsert");
      return c.json(toBankAccount(row), 201);
    },
  );
  app.patch(
    "/api/v1/bank-accounts/:id",
    zValidator("json", updateBankAccountSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const accountId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await financeService.getBankAccountById(
          auth.workspaceId,
          accountId,
        );
        if (!existing) return c.json(notFound("Bank account"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "bank_account",
          entityId: accountId,
          operation: "upsert",
          payload: buildBankAccountRestPayload(accountId, patch),
        });
        const row = await financeService.getBankAccountById(
          auth.workspaceId,
          accountId,
        );
        if (!row) return c.json(notFound("Bank account"), 404);
        nudgePeerEntityLive(auth, "bank_account", row.id, "upsert");
        return c.json(toBankAccount(row));
      }
      const row = await financeService.updateBankAccount(
        auth.workspaceId,
        accountId,
        patch,
      );
      if (!row) return c.json(notFound("Bank account"), 404);
      await recordBankAccountRestSyncEvent(auth.workspaceId, row, "upsert");
      nudgePeerEntityLive(auth, "bank_account", row.id, "upsert");
      return c.json(toBankAccount(row));
    },
  );
  app.delete("/api/v1/bank-accounts/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const accountId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await financeService.getBankAccountById(
        auth.workspaceId,
        accountId,
      );
      if (!existing) return c.json(notFound("Bank account"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "bank_account",
        entityId: accountId,
        operation: "delete",
        payload: { id: accountId, deleted_at: new Date().toISOString() },
      });
      nudgePeerEntityLive(auth, "bank_account", accountId, "delete");
      return c.body(null, 204);
    }
    const row = await financeService.deleteBankAccount(
      auth.workspaceId,
      accountId,
    );
    if (!row) return c.json(notFound("Bank account"), 404);
    await recordBankAccountRestSyncEvent(auth.workspaceId, row, "delete");
    nudgePeerEntityLive(auth, "bank_account", row.id, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/financial-categories", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listFinancialCategories(auth.workspaceId);
    return c.json({ categories: rows.map(toFinancialCategory) });
  });
  app.post(
    "/api/v1/financial-categories",
    zValidator("json", financialCategoryInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const categoryId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_category",
          entityId: categoryId,
          operation: "upsert",
          payload: buildFinancialCategoryRestPayload(categoryId, body),
        });
        const row = await financeService.getFinancialCategoryById(
          auth.workspaceId,
          categoryId,
        );
        if (!row) {
          return c.json(
            { error: "Financial category create failed", code: "internal" },
            500,
          );
        }
        return c.json(toFinancialCategory(row), 201);
      }
      const row = await financeService.createFinancialCategory(
        auth.workspaceId,
        body,
      );
      await recordFinancialCategoryRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialCategory(row), 201);
    },
  );
  app.patch(
    "/api/v1/financial-categories/:id",
    zValidator("json", updateFinancialCategorySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const categoryId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await financeService.getFinancialCategoryById(
          auth.workspaceId,
          categoryId,
        );
        if (!existing) return c.json(notFound("Financial category"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_category",
          entityId: categoryId,
          operation: "upsert",
          payload: buildFinancialCategoryRestPayload(categoryId, patch),
        });
        const row = await financeService.getFinancialCategoryById(
          auth.workspaceId,
          categoryId,
        );
        if (!row) return c.json(notFound("Financial category"), 404);
        return c.json(toFinancialCategory(row));
      }
      const row = await financeService.updateFinancialCategory(
        auth.workspaceId,
        categoryId,
        patch,
      );
      if (!row) return c.json(notFound("Financial category"), 404);
      await recordFinancialCategoryRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialCategory(row));
    },
  );
  app.delete("/api/v1/financial-categories/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const categoryId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await financeService.getFinancialCategoryById(
        auth.workspaceId,
        categoryId,
      );
      if (!existing) return c.json(notFound("Financial category"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "financial_category",
        entityId: categoryId,
        operation: "delete",
        payload: { id: categoryId, deleted_at: new Date().toISOString() },
      });
      return c.body(null, 204);
    }
    const row = await financeService.deleteFinancialCategory(
      auth.workspaceId,
      categoryId,
    );
    if (!row) return c.json(notFound("Financial category"), 404);
    await recordFinancialCategoryRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/financial-goals", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const [rows, savedByGoalId] = await Promise.all([
      financeService.listFinancialGoals(auth.workspaceId),
      financeService.sumSavedCentsByGoalId(auth.workspaceId),
    ]);
    return c.json({
      goals: rows.map((row) =>
        toFinancialGoal(row, savedByGoalId.get(row.id) ?? 0),
      ),
    });
  });
  app.post(
    "/api/v1/financial-goals",
    zValidator("json", financialGoalInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const goalId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_goal",
          entityId: goalId,
          operation: "upsert",
          payload: buildFinancialGoalRestPayload(goalId, body),
        });
        const row = await financeService.getFinancialGoalById(
          auth.workspaceId,
          goalId,
        );
        if (!row) {
          return c.json(
            { error: "Financial goal create failed", code: "internal" },
            500,
          );
        }
        return c.json(toFinancialGoal(row, 0), 201);
      }
      const row = await financeService.createFinancialGoal(
        auth.workspaceId,
        body,
      );
      await recordFinancialGoalRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialGoal(row, 0), 201);
    },
  );
  app.patch(
    "/api/v1/financial-goals/:id",
    zValidator("json", updateFinancialGoalSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const id = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await financeService.getFinancialGoalById(
          auth.workspaceId,
          id,
        );
        if (!existing) return c.json(notFound("Financial goal"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_goal",
          entityId: id,
          operation: "upsert",
          payload: buildFinancialGoalRestPayload(id, patch),
        });
        const row = await financeService.getFinancialGoalById(
          auth.workspaceId,
          id,
        );
        if (!row) return c.json(notFound("Financial goal"), 404);
        const savedCents = await financeService.getGoalSavedCents(
          auth.workspaceId,
          id,
        );
        return c.json(toFinancialGoal(row, savedCents));
      }
      const row = await financeService.updateFinancialGoal(
        auth.workspaceId,
        id,
        patch,
      );
      if (!row) return c.json(notFound("Financial goal"), 404);
      await recordFinancialGoalRestSyncEvent(auth.workspaceId, row, "upsert");
      const savedCents = await financeService.getGoalSavedCents(
        auth.workspaceId,
        id,
      );
      return c.json(toFinancialGoal(row, savedCents));
    },
  );
  app.delete("/api/v1/financial-goals/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const goalId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await financeService.getFinancialGoalById(
        auth.workspaceId,
        goalId,
      );
      if (!existing) return c.json(notFound("Financial goal"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "financial_goal",
        entityId: goalId,
        operation: "delete",
        payload: { id: goalId, deleted_at: new Date().toISOString() },
      });
      return c.body(null, 204);
    }
    const row = await financeService.deleteFinancialGoal(
      auth.workspaceId,
      goalId,
    );
    if (!row) return c.json(notFound("Financial goal"), 404);
    await recordFinancialGoalRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/financial-recurrings", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listFinancialRecurrings(auth.workspaceId);
    return c.json({ recurrings: rows.map(toFinancialRecurring) });
  });
  app.post(
    "/api/v1/financial-recurrings",
    zValidator("json", financialRecurringInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const recurringId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_recurring",
          entityId: recurringId,
          operation: "upsert",
          payload: buildFinancialRecurringRestPayload(recurringId, body),
        });
        const row = await financeService.getFinancialRecurringById(
          auth.workspaceId,
          recurringId,
        );
        if (!row) {
          return c.json(
            { error: "Financial recurring create failed", code: "internal" },
            500,
          );
        }
        return c.json(toFinancialRecurring(row), 201);
      }
      const row = await financeService.createFinancialRecurring(
        auth.workspaceId,
        body,
      );
      await recordFinancialRecurringRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialRecurring(row), 201);
    },
  );
  app.patch(
    "/api/v1/financial-recurrings/:id",
    zValidator("json", updateFinancialRecurringSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const recurringId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await financeService.getFinancialRecurringById(
          auth.workspaceId,
          recurringId,
        );
        if (!existing) return c.json(notFound("Financial recurring"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_recurring",
          entityId: recurringId,
          operation: "upsert",
          payload: buildFinancialRecurringRestPayload(recurringId, patch),
        });
        const row = await financeService.getFinancialRecurringById(
          auth.workspaceId,
          recurringId,
        );
        if (!row) return c.json(notFound("Financial recurring"), 404);
        return c.json(toFinancialRecurring(row));
      }
      const row = await financeService.updateFinancialRecurring(
        auth.workspaceId,
        recurringId,
        patch,
      );
      if (!row) return c.json(notFound("Financial recurring"), 404);
      await recordFinancialRecurringRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toFinancialRecurring(row));
    },
  );
  app.delete("/api/v1/financial-recurrings/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const recurringId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await financeService.getFinancialRecurringById(
        auth.workspaceId,
        recurringId,
      );
      if (!existing) return c.json(notFound("Financial recurring"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "financial_recurring",
        entityId: recurringId,
        operation: "delete",
        payload: { id: recurringId, deleted_at: new Date().toISOString() },
      });
      return c.body(null, 204);
    }
    const row = await financeService.deleteFinancialRecurring(
      auth.workspaceId,
      recurringId,
    );
    if (!row) return c.json(notFound("Financial recurring"), 404);
    await recordFinancialRecurringRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  app.get("/api/v1/cashflow-planner-entries", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listCashflowPlannerEntries(
      auth.workspaceId,
    );
    return c.json({ entries: rows.map(toCashflowPlannerEntry) });
  });
  app.post(
    "/api/v1/cashflow-planner-entries",
    zValidator("json", cashflowPlannerEntryInputSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const entryId = newId();
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "cashflow_planner_entry",
          entityId: entryId,
          operation: "upsert",
          payload: buildCashflowPlannerRestPayload(entryId, body),
        });
        const row = await financeService.getCashflowPlannerEntryById(
          auth.workspaceId,
          entryId,
        );
        if (!row) {
          return c.json(
            { error: "Cashflow planner entry create failed", code: "internal" },
            500,
          );
        }
        return c.json(toCashflowPlannerEntry(row), 201);
      }
      const row = await financeService.createCashflowPlannerEntry(
        auth.workspaceId,
        body,
      );
      await recordCashflowPlannerRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toCashflowPlannerEntry(row), 201);
    },
  );
  app.patch(
    "/api/v1/cashflow-planner-entries/:id",
    zValidator("json", updateCashflowPlannerEntrySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const entryId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await financeService.getCashflowPlannerEntryById(
          auth.workspaceId,
          entryId,
        );
        if (!existing) return c.json(notFound("Cashflow planner entry"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "cashflow_planner_entry",
          entityId: entryId,
          operation: "upsert",
          payload: buildCashflowPlannerRestPayload(entryId, patch),
        });
        const row = await financeService.getCashflowPlannerEntryById(
          auth.workspaceId,
          entryId,
        );
        if (!row) return c.json(notFound("Cashflow planner entry"), 404);
        return c.json(toCashflowPlannerEntry(row));
      }
      const row = await financeService.updateCashflowPlannerEntry(
        auth.workspaceId,
        entryId,
        patch,
      );
      if (!row) return c.json(notFound("Cashflow planner entry"), 404);
      await recordCashflowPlannerRestSyncEvent(auth.workspaceId, row, "upsert");
      return c.json(toCashflowPlannerEntry(row));
    },
  );
  app.delete("/api/v1/cashflow-planner-entries/:id", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
    const entryId = c.req.param("id");
    if (isRestLeaderFirstWrite()) {
      const existing = await financeService.getCashflowPlannerEntryById(
        auth.workspaceId,
        entryId,
      );
      if (!existing) return c.json(notFound("Cashflow planner entry"), 404);
      await commitRestEntityWrite({
        workspaceId: auth.workspaceId,
        entity: "cashflow_planner_entry",
        entityId: entryId,
        operation: "delete",
        payload: { id: entryId, deleted_at: new Date().toISOString() },
      });
      return c.body(null, 204);
    }
    const row = await financeService.deleteCashflowPlannerEntry(
      auth.workspaceId,
      entryId,
    );
    if (!row) return c.json(notFound("Cashflow planner entry"), 404);
    await recordCashflowPlannerRestSyncEvent(auth.workspaceId, row, "delete");
    return c.body(null, 204);
  });

  const toListTransactionFilters = (
    query: z.infer<typeof listFinancialTransactionsQuerySchema>,
  ) => ({
    q: query.q,
    from: query.from,
    to: query.to,
    month: query.month,
    organizationId: query.organizationId,
    projectId: query.projectId,
    categoryId: query.categoryId,
    goalId: query.goalId,
    recurringId: query.recurringId,
    categoryIds: query.categoryIds
      ? query.categoryIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined,
    uncategorized: query.uncategorized === "true",
    unassignedOrg: query.unassignedOrg === "true",
    unassignedGoal: query.unassignedGoal === "true",
    unassignedRecurring: query.unassignedRecurring === "true",
    amountSign: query.amountSign,
    limit: query.limit,
    cursor: query.cursor,
    includeTotal: query.includeTotal === "true",
  });

  app.get(
    "/api/v1/transactions",
    zValidator("query", listFinancialTransactionsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const result = await financeService.listTransactions(
        auth.workspaceId,
        null,
        toListTransactionFilters(query),
      );
      if (!result) return c.json(forbidden(), 403);
      return c.json({
        transactions: result.transactions.map(toFinancialTransaction),
        nextCursor: result.nextCursor,
        ...(result.total !== undefined ? { total: result.total } : {}),
      });
    },
  );

  app.get(
    "/api/v1/bank-accounts/:id/transactions",
    zValidator("query", listFinancialTransactionsQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const query = c.req.valid("query");
      const result = await financeService.listTransactions(
        auth.workspaceId,
        c.req.param("id"),
        toListTransactionFilters(query),
      );
      if (!result) return c.json(notFound("Bank account"), 404);
      return c.json({
        transactions: result.transactions.map(toFinancialTransaction),
        nextCursor: result.nextCursor,
        ...(result.total !== undefined ? { total: result.total } : {}),
      });
    },
  );

  app.get(
    "/api/v1/transactions/:id",
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
      const row = await financeService.getTransactionById(
        auth.workspaceId,
        c.req.param("id"),
      );
      return row
        ? c.json(toFinancialTransaction(row))
        : c.json(notFound("Transaction"), 404);
    },
  );

  app.patch(
    "/api/v1/transactions/:id",
    zValidator("json", updateFinancialTransactionSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const transactionId = c.req.param("id");
      const patch = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await financeService.getTransactionById(
          auth.workspaceId,
          transactionId,
        );
        if (!existing) return c.json(notFound("Transaction"), 404);
        await commitRestEntityWrite({
          workspaceId: auth.workspaceId,
          entity: "financial_transaction",
          entityId: transactionId,
          operation: "upsert",
          payload: buildFinancialTransactionRestPayload(transactionId, patch),
        });
        const row = await financeService.getTransactionById(
          auth.workspaceId,
          transactionId,
        );
        if (!row) return c.json(notFound("Transaction"), 404);
        return c.json(toFinancialTransaction(row));
      }
      const row = await financeService.updateTransaction(
        auth.workspaceId,
        transactionId,
        patch,
      );
      if (row === "account_not_found") {
        return c.json(notFound("Bank account"), 404);
      }
      if (!row) return c.json(notFound("Transaction"), 404);
      await recordFinancialTransactionRestSyncEvent(
        auth.workspaceId,
        row,
        "upsert",
      );
      return c.json(toFinancialTransaction(row));
    },
  );

  app.post(
    "/api/v1/transactions/batch",
    zValidator("json", batchUpdateFinancialTransactionsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        await commitRestEntityWriteBatch({
          workspaceId: auth.workspaceId,
          changes: body.ids.map((id) => ({
            entity: "financial_transaction" as const,
            entityId: id,
            operation: "upsert" as const,
            payload: buildFinancialTransactionRestPayload(id, body.patch),
          })),
        });
        const loaded = await Promise.all(
          body.ids.map((id) =>
            financeService.getTransactionById(auth.workspaceId, id),
          ),
        );
        const rows = loaded.filter(
          (row): row is NonNullable<typeof row> => row != null,
        );
        return c.json({
          updated: rows.length,
          transactions: rows.map(toFinancialTransaction),
        });
      }
      const rows = await financeService.batchUpdateTransactions(
        auth.workspaceId,
        body.ids,
        body.patch,
      );
      if (rows === "account_not_found") {
        return c.json(notFound("Bank account"), 404);
      }
      for (const row of rows) {
        await recordFinancialTransactionRestSyncEvent(
          auth.workspaceId,
          row,
          "upsert",
        );
      }
      return c.json({
        updated: rows.length,
        transactions: rows.map(toFinancialTransaction),
      });
    },
  );

  app.post(
    "/api/v1/transactions/batch-delete",
    zValidator("json", batchDeleteFinancialTransactionsSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const body = c.req.valid("json");
      if (isRestLeaderFirstWrite()) {
        const existing = await Promise.all(
          body.ids.map((id) =>
            financeService.getTransactionById(auth.workspaceId, id),
          ),
        );
        const toDelete = existing.filter(
          (row): row is NonNullable<typeof row> => row != null,
        );
        if (toDelete.length > 0) {
          await commitRestEntityWriteBatch({
            workspaceId: auth.workspaceId,
            changes: toDelete.map((row) => ({
              entity: "financial_transaction" as const,
              entityId: row.id,
              operation: "delete" as const,
              payload: { id: row.id },
            })),
          });
        }
        return c.json({ deleted: toDelete.length });
      }
      const before = await Promise.all(
        body.ids.map((id) =>
          financeService.getTransactionById(auth.workspaceId, id),
        ),
      );
      const deleted = await financeService.batchDeleteTransactions(
        auth.workspaceId,
        body.ids,
      );
      for (const row of before) {
        if (row) {
          await recordFinancialTransactionRestSyncEvent(
            auth.workspaceId,
            row,
            "delete",
          );
        }
      }
      return c.json({ deleted });
    },
  );

  app.get("/api/v1/bank-accounts/:id/imports", async (c) => {
    const auth = getAuth(c);
    if (!can(auth, "finance:read")) return c.json(forbidden(), 403);
    const rows = await financeService.listImportBatches(
      auth.workspaceId,
      c.req.param("id"),
    );
    if (!rows) return c.json(notFound("Bank account"), 404);
    return c.json({ imports: rows.map(toFinancialImportBatch) });
  });

  app.post(
    "/api/v1/bank-accounts/:id/imports",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) =>
        c.json(
          { error: "CSV too large", code: "payload_too_large" },
          413,
        ),
    }),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.byteLength === 0) {
        return c.json({ error: "Empty CSV body", code: "bad_request" }, 400);
      }
      try {
        const result = await financeService.importBankCsv(
          auth.workspaceId,
          c.req.param("id"),
          bytes,
          c.req.header("X-Filename") ?? "import.csv",
        );
        if (!result) return c.json(notFound("Bank account"), 404);
        return c.json(result, 201);
      } catch (error) {
        return c.json(
          {
            error: error instanceof Error ? error.message : "Import failed",
            code: "bad_request",
          },
          400,
        );
      }
    },
  );

  app.post(
    "/api/v1/bank-accounts/:id/moneybird-sync",
    zValidator("query", moneybirdBankAccountSyncQuerySchema),
    async (c) => {
      const auth = getAuth(c);
      if (!can(auth, "finance:write")) return c.json(forbidden(), 403);
      try {
        const result =
          await moneybirdBankSyncService.syncBankAccountFromMoneybird(
            auth.workspaceId,
            c.req.param("id"),
            { period: c.req.valid("query").period },
          );
        if (!result) return c.json(notFound("Bank account"), 404);
        const account = await financeService.getBankAccountById(
          auth.workspaceId,
          c.req.param("id"),
        );
        if (account) {
          if (isRestLeaderFirstWrite()) {
            await commitRestEntityWrite({
              workspaceId: auth.workspaceId,
              entity: "bank_account",
              entityId: account.id,
              operation: "upsert",
              payload: buildBankAccountRestPayload(account.id, {
                moneybirdLastSyncedAt: account.moneybirdLastSyncedAt,
              }),
            });
          } else {
            await recordBankAccountRestSyncEvent(
              auth.workspaceId,
              account,
              "upsert",
            );
          }
        }
        return c.json(result);
      } catch (error) {
        if (error instanceof MoneybirdApiError && error.status === 404) {
          return c.json({ error: error.message, code: "not_found" }, 404);
        }
        const message =
          error instanceof Error
            ? error.message
            : "Moneybird bank sync failed";
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );

  /** Owner gate for Settings → API keys (see `canManageApiKeys`). */
}
