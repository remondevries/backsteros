import type {
  StripeBalanceTransaction,
  StripeBalanceTransactionsQuery,
  StripeBalanceTransactionsResponse,
  StripeSettings,
  StripeTestConnectionResult,
} from "@backsteros/contracts";
import type Stripe from "stripe";

import { previewCursorApiKey } from "./cursor-settings.js";
import { createIntegrationSecretSettingsService } from "./integration-secret-settings.js";
import { workspaceIntegrationSecretStore } from "./integration-secret-store.js";
import { getConfiguredStripeSecretKey } from "./stripe-auth.js";
import {
  createStripeClient,
  StripeApiError,
  StripeNotConfiguredError,
} from "../lib/stripe-client.js";

export function previewStripeSecretKey(key: string): string {
  return previewCursorApiKey(key);
}

const stripeSettings = createIntegrationSecretSettingsService({
  store: workspaceIntegrationSecretStore("stripeSecretKey"),
  patchKey: "secretKey",
  preview: previewStripeSecretKey,
  envFallback: getConfiguredStripeSecretKey,
  toSettings: (state): StripeSettings => ({
    secretKeyConfigured: state.configured,
    secretKeyPreview: state.preview,
    connected: state.connected,
    envSecretConfigured: state.envConfigured,
  }),
  test: testStripeSecretKey,
});

/** Workspace-stored Stripe secret (Settings → Stripe). */
export const getWorkspaceStripeSecretKey = stripeSettings.getWorkspaceSecret;

/** Workspace secret, then `STRIPE_SECRET_KEY` / machine-secret fallback. */
export const getWorkspaceOrEnvStripeSecretKey = stripeSettings.getSecret;

export const getStripeSettings = stripeSettings.getSettings;

export const updateStripeSettings = stripeSettings.updateSettings;

export const testStripeConnection = stripeSettings.testConnection;

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
