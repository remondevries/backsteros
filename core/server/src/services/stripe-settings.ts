import { eq } from "drizzle-orm";
import type {
  StripeBalanceTransaction,
  StripeBalanceTransactionsQuery,
  StripeBalanceTransactionsResponse,
  StripeSettings,
  StripeTestConnectionResult,
  UpdateStripeSettingsInput,
} from "@backsteros/contracts";
import type Stripe from "stripe";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import { getConfiguredStripeSecretKey } from "./stripe-auth.js";
import {
  createStripeClient,
  StripeApiError,
  StripeNotConfiguredError,
} from "../lib/stripe-client.js";

export function previewStripeSecretKey(key: string): string {
  return previewCursorApiKey(key);
}

function normalizeSecret(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getSecretRow(workspaceId: string): Promise<{
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
} | null> {
  const [row] = await db
    .select({
      stripePublishableKey: workspaceIntegrationSecrets.stripePublishableKey,
      stripeSecretKey: workspaceIntegrationSecrets.stripeSecretKey,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Workspace-stored Stripe secret (Settings → Stripe). */
export async function getWorkspaceStripeSecretKey(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  return normalizeSecret(row?.stripeSecretKey);
}

/** Workspace secret, then `STRIPE_SECRET_KEY` / machine-secret fallback. */
export async function getWorkspaceOrEnvStripeSecretKey(
  workspaceId: string,
): Promise<string | null> {
  return (
    (await getWorkspaceStripeSecretKey(workspaceId)) ??
    normalizeSecret(getConfiguredStripeSecretKey())
  );
}

export async function getStripeSettings(
  workspaceId: string,
): Promise<StripeSettings> {
  const row = await getSecretRow(workspaceId);
  const publishable = normalizeSecret(row?.stripePublishableKey);
  const secret = normalizeSecret(row?.stripeSecretKey);
  const envSecret = normalizeSecret(getConfiguredStripeSecretKey());
  return {
    publishableKeyConfigured: publishable != null,
    publishableKeyPreview: publishable
      ? previewStripeSecretKey(publishable)
      : null,
    secretKeyConfigured: secret != null,
    secretKeyPreview: secret ? previewStripeSecretKey(secret) : null,
    connected: secret != null || envSecret != null,
    envSecretConfigured: envSecret != null,
  };
}

export async function updateStripeSettings(
  workspaceId: string,
  patch: UpdateStripeSettingsInput,
): Promise<StripeSettings> {
  const updates: {
    stripePublishableKey?: string | null;
    stripeSecretKey?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (patch.publishableKey !== undefined) {
    updates.stripePublishableKey = normalizeSecret(patch.publishableKey);
  }
  if (patch.secretKey !== undefined) {
    updates.stripeSecretKey = normalizeSecret(patch.secretKey);
  }

  if (
    patch.publishableKey !== undefined ||
    patch.secretKey !== undefined
  ) {
    await db
      .insert(workspaceIntegrationSecrets)
      .values({
        workspaceId,
        stripePublishableKey:
          patch.publishableKey !== undefined
            ? normalizeSecret(patch.publishableKey)
            : null,
        stripeSecretKey:
          patch.secretKey !== undefined
            ? normalizeSecret(patch.secretKey)
            : null,
      })
      .onConflictDoUpdate({
        target: workspaceIntegrationSecrets.workspaceId,
        set: updates,
      });
  }

  return getStripeSettings(workspaceId);
}

export async function testStripeConnection(
  workspaceId: string,
): Promise<StripeTestConnectionResult> {
  return testStripeSecretKey(
    await getWorkspaceOrEnvStripeSecretKey(workspaceId),
  );
}

async function testStripeSecretKey(
  secretKey: string | null,
): Promise<StripeTestConnectionResult> {
  if (!secretKey) {
    return {
      ok: false,
      error:
        "Stripe secret key is not configured. Paste a secret key in Settings → Stripe.",
      livemode: null,
    };
  }

  try {
    const stripe = createStripeClient(secretKey);
    const balance = await stripe.balance.retrieve();
    return {
      ok: true,
      error: null,
      livemode: Boolean(balance.livemode),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Stripe connection test failed.",
      livemode: null,
    };
  }
}

function mapBalanceTransaction(
  row: Stripe.BalanceTransaction,
): StripeBalanceTransaction {
  const source =
    typeof row.source === "string"
      ? row.source
      : row.source && typeof row.source === "object" && "id" in row.source
        ? String(row.source.id)
        : null;
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    type: row.type,
    status: row.status ?? null,
    created: row.created,
    description: row.description ?? null,
    fee: row.fee,
    net: row.net,
    source,
  };
}

export async function listStripeBalanceTransactions(
  workspaceId: string,
  query: StripeBalanceTransactionsQuery = {},
): Promise<StripeBalanceTransactionsResponse> {
  const secretKey = await getWorkspaceOrEnvStripeSecretKey(workspaceId);
  if (!secretKey) {
    throw new StripeNotConfiguredError();
  }

  const stripe = createStripeClient(secretKey);
  const limit = query.limit ?? 25;
  try {
    const page = await stripe.balanceTransactions.list({
      limit,
      ...(query.startingAfter
        ? { starting_after: query.startingAfter }
        : {}),
      ...(query.type ? { type: query.type } : {}),
    });
    return {
      transactions: page.data.map(mapBalanceTransaction),
      hasMore: page.has_more,
    };
  } catch (error) {
    if (error instanceof StripeApiError) throw error;
    const message =
      error instanceof Error
        ? error.message
        : "Could not list Stripe balance transactions";
    throw new StripeApiError(message);
  }
}

export { StripeApiError, StripeNotConfiguredError };
