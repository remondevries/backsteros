/**
 * bunq workspace integration settings (OS-166).
 * Secrets in workspace_integration_secrets — never PowerSync, never returned raw.
 *
 * Dual environment allowlist:
 * - sandbox → sandbox host + sandbox_ keys (unchanged)
 * - production → api.bunq.com + live keys only (explicit; read-only)
 */

import { and, eq, isNull } from "drizzle-orm";

import type {
  BunqMonetaryAccountSummary,
  BunqPaymentSummary,
  BunqSandboxFundResult,
  BunqSettings,
  BunqTestConnectionResult,
  UpdateBunqSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { bankAccounts, workspaceIntegrationSecrets } from "../db/schema.js";
import {
  assertBunqApiKey,
  assertBunqEnvironment,
  assertBunqPermittedIps,
  BUNQ_PRODUCTION_ENVIRONMENT,
  BUNQ_SANDBOX_ENVIRONMENT,
  BunqApiError,
  BunqClient,
  BunqLiveApiRefusedError,
  generateBunqSigningKeyPair,
  type BunqEnvironment,
  type BunqMonetaryAccount,
  type BunqPayment,
} from "../lib/bunq-client.js";
import { isBunqPaymentProposalsEnabled } from "../lib/bunq-payment-proposal.js";
import { isBunqPaymentSimulationEnabled } from "../lib/bunq-payment-simulation.js";
import {
  BUNQ_PERSONAL_BANK_ACCOUNT_KEY,
  ensureBunqPersonalBankAccount,
} from "./bunq-personal-bank-account.js";
import { previewCursorApiKey } from "./cursor-settings.js";

export function previewBunqSecret(secret: string): string {
  return previewCursorApiKey(secret);
}

type BunqSecretRow = {
  bunqApiKey: string | null;
  bunqSigningPrivateKeyPem: string | null;
  bunqInstallationToken: string | null;
  bunqServerPublicKeyPem: string | null;
  bunqSessionToken: string | null;
  bunqSessionExpiresAt: Date | null;
  bunqDeviceId: string | null;
  bunqUserId: string | null;
  bunqEnvironment: string | null;
  bunqPermittedIps: string[];
  bunqLastConnectedAt: Date | null;
};

async function getSecretRow(workspaceId: string): Promise<BunqSecretRow | null> {
  const [row] = await db
    .select({
      bunqApiKey: workspaceIntegrationSecrets.bunqApiKey,
      bunqSigningPrivateKeyPem:
        workspaceIntegrationSecrets.bunqSigningPrivateKeyPem,
      bunqInstallationToken: workspaceIntegrationSecrets.bunqInstallationToken,
      bunqServerPublicKeyPem: workspaceIntegrationSecrets.bunqServerPublicKeyPem,
      bunqSessionToken: workspaceIntegrationSecrets.bunqSessionToken,
      bunqSessionExpiresAt: workspaceIntegrationSecrets.bunqSessionExpiresAt,
      bunqDeviceId: workspaceIntegrationSecrets.bunqDeviceId,
      bunqUserId: workspaceIntegrationSecrets.bunqUserId,
      bunqEnvironment: workspaceIntegrationSecrets.bunqEnvironment,
      bunqPermittedIps: workspaceIntegrationSecrets.bunqPermittedIps,
      bunqLastConnectedAt: workspaceIntegrationSecrets.bunqLastConnectedAt,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

function normalizeOptionalSecret(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function environmentFromRow(row: BunqSecretRow | null): BunqEnvironment {
  try {
    return assertBunqEnvironment(
      row?.bunqEnvironment ?? BUNQ_SANDBOX_ENVIRONMENT,
    );
  } catch {
    return BUNQ_SANDBOX_ENVIRONMENT;
  }
}

function mapAccount(account: BunqMonetaryAccount): BunqMonetaryAccountSummary {
  return {
    id: account.id,
    description: account.description,
    balanceValue: account.balance?.value ?? null,
    balanceCurrency: account.balance?.currency ?? account.currency,
    status: account.status,
    iban: account.iban,
  };
}

function mapPayment(payment: BunqPayment): BunqPaymentSummary {
  return {
    id: payment.id,
    created: payment.created,
    updated: payment.updated,
    amountValue: payment.amount?.value ?? null,
    amountCurrency: payment.amount?.currency ?? null,
    description: payment.description,
    counterpartyName: payment.counterpartyName,
    counterpartyIban: payment.counterpartyIban,
    type: payment.type,
    subType: payment.subType,
  };
}

async function findBunqPersonalBankAccount(workspaceId: string) {
  const [row] = await db
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
    })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.workspaceId, workspaceId),
        eq(bankAccounts.key, BUNQ_PERSONAL_BANK_ACCOUNT_KEY),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getBunqSettings(
  workspaceId: string,
): Promise<BunqSettings> {
  const row = await getSecretRow(workspaceId);
  const apiKey = normalizeOptionalSecret(row?.bunqApiKey);
  const privateKey = normalizeOptionalSecret(row?.bunqSigningPrivateKeyPem);
  const installationToken = normalizeOptionalSecret(row?.bunqInstallationToken);
  const sessionToken = normalizeOptionalSecret(row?.bunqSessionToken);
  const permittedIps = row?.bunqPermittedIps ?? [];
  const environment = environmentFromRow(row);
  const bankAccount = await findBunqPersonalBankAccount(workspaceId);
  return {
    environment,
    apiKeyConfigured: Boolean(apiKey),
    apiKeyPreview: apiKey ? previewBunqSecret(apiKey) : null,
    signingPrivateKeyConfigured: Boolean(privateKey),
    installationConfigured: Boolean(installationToken),
    sessionConfigured: Boolean(sessionToken),
    deviceId: row?.bunqDeviceId ?? null,
    userId: row?.bunqUserId ?? null,
    permittedIps,
    lastConnectedAt: row?.bunqLastConnectedAt?.toISOString() ?? null,
    connected: Boolean(apiKey && privateKey && installationToken && sessionToken),
    bankAccountId: bankAccount?.id ?? null,
    bankAccountName: bankAccount?.name ?? null,
    paymentProposalsEnabled: isBunqPaymentProposalsEnabled(),
    paymentSimulation: isBunqPaymentSimulationEnabled(),
  };
}

async function upsertBunqRow(
  workspaceId: string,
  patch: Partial<{
    bunqApiKey: string | null;
    bunqSigningPrivateKeyPem: string | null;
    bunqInstallationToken: string | null;
    bunqServerPublicKeyPem: string | null;
    bunqSessionToken: string | null;
    bunqSessionExpiresAt: Date | null;
    bunqDeviceId: string | null;
    bunqUserId: string | null;
    bunqEnvironment: string | null;
    bunqPermittedIps: string[];
    bunqLastConnectedAt: Date | null;
  }>,
): Promise<void> {
  const environment =
    patch.bunqEnvironment != null
      ? assertBunqEnvironment(patch.bunqEnvironment)
      : undefined;
  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      bunqEnvironment: environment ?? BUNQ_SANDBOX_ENVIRONMENT,
      ...patch,
      ...(environment ? { bunqEnvironment: environment } : {}),
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        ...patch,
        ...(environment ? { bunqEnvironment: environment } : {}),
        updatedAt: new Date(),
      },
    });
}

export async function updateBunqSettings(
  workspaceId: string,
  patch: UpdateBunqSettingsInput,
): Promise<BunqSettings> {
  const current = await getSecretRow(workspaceId);
  let nextEnvironment = environmentFromRow(current);
  let nextApiKey = normalizeOptionalSecret(current?.bunqApiKey);
  let nextPrivateKey = normalizeOptionalSecret(
    current?.bunqSigningPrivateKeyPem,
  );
  let nextPermittedIps = current?.bunqPermittedIps ?? [];
  let clearConnection = false;

  if (patch.environment !== undefined) {
    const env = assertBunqEnvironment(patch.environment);
    if (env !== nextEnvironment) {
      nextEnvironment = env;
      clearConnection = true;
    }
  }

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    if (!trimmed) {
      nextApiKey = null;
      clearConnection = true;
    } else {
      nextApiKey = assertBunqApiKey(trimmed, nextEnvironment);
      clearConnection = true;
    }
  } else if (
    nextApiKey &&
    patch.environment !== undefined
  ) {
    // Re-validate stored key when environment flips.
    nextApiKey = assertBunqApiKey(nextApiKey, nextEnvironment);
  }

  if (patch.signingPrivateKeyPem !== undefined) {
    const trimmed = patch.signingPrivateKeyPem.trim();
    if (!trimmed) {
      nextPrivateKey = null;
      clearConnection = true;
    } else if (!trimmed.includes("PRIVATE KEY")) {
      throw new BunqApiError(400, "", "bunq signing private key PEM is invalid");
    } else {
      nextPrivateKey = trimmed;
      clearConnection = true;
    }
  }

  if (patch.permittedIps !== undefined) {
    nextPermittedIps = assertBunqPermittedIps(patch.permittedIps);
    clearConnection = true;
  }

  const writePatch: Parameters<typeof upsertBunqRow>[1] = {
    bunqApiKey: nextApiKey,
    bunqSigningPrivateKeyPem: nextPrivateKey,
    bunqPermittedIps: nextPermittedIps,
    bunqEnvironment: nextEnvironment,
  };

  if (clearConnection) {
    writePatch.bunqInstallationToken = null;
    writePatch.bunqServerPublicKeyPem = null;
    writePatch.bunqSessionToken = null;
    writePatch.bunqSessionExpiresAt = null;
    writePatch.bunqDeviceId = null;
    writePatch.bunqUserId = null;
    writePatch.bunqLastConnectedAt = null;
  }

  await upsertBunqRow(workspaceId, writePatch);
  return getBunqSettings(workspaceId);
}

function buildClientFromRow(
  row: BunqSecretRow,
  options?: { allowPaymentWrites?: boolean },
): BunqClient {
  const apiKey = normalizeOptionalSecret(row.bunqApiKey);
  const privateKey = normalizeOptionalSecret(row.bunqSigningPrivateKeyPem);
  if (!apiKey || !privateKey) {
    throw new BunqApiError(
      400,
      "",
      "bunq API key and signing private key are required",
    );
  }
  const environment = environmentFromRow(row);
  const permittedIps = assertBunqPermittedIps(row.bunqPermittedIps ?? []);
  const allowPaymentWrites = options?.allowPaymentWrites === true;
  return new BunqClient({
    environment,
    apiKey,
    signingPrivateKeyPem: privateKey,
    permittedIps,
    installationToken: row.bunqInstallationToken,
    serverPublicKeyPem: row.bunqServerPublicKeyPem,
    sessionToken: row.bunqSessionToken,
    deviceId: row.bunqDeviceId,
    userId: row.bunqUserId,
    allowPaymentWrites,
    deviceDescription:
      environment === BUNQ_PRODUCTION_ENVIRONMENT
        ? allowPaymentWrites
          ? "BacksterOS finance payments"
          : "BacksterOS read-only finance"
        : undefined,
  });
}

async function persistClientContext(
  workspaceId: string,
  client: BunqClient,
  expiresAt: Date | null,
): Promise<void> {
  await upsertBunqRow(workspaceId, {
    bunqInstallationToken: client.installationToken,
    bunqServerPublicKeyPem: client.serverPublicKeyPem,
    bunqSessionToken: client.sessionToken,
    bunqSessionExpiresAt: expiresAt,
    bunqDeviceId: client.deviceId,
    bunqUserId: client.userId,
    bunqLastConnectedAt: new Date(),
    bunqEnvironment: client.environment,
  });
}

/**
 * Ensure installation/device/session for the configured environment.
 * Generates a signing keypair when missing.
 */
export async function connectBunq(
  workspaceId: string,
): Promise<BunqSettings> {
  let row = await getSecretRow(workspaceId);
  if (!normalizeOptionalSecret(row?.bunqApiKey)) {
    throw new BunqApiError(400, "", "bunq API key is not configured");
  }
  if (!normalizeOptionalSecret(row?.bunqSigningPrivateKeyPem)) {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    await upsertBunqRow(workspaceId, {
      bunqSigningPrivateKeyPem: privateKeyPem,
      bunqEnvironment: environmentFromRow(row),
    });
    row = await getSecretRow(workspaceId);
  }
  if (!row) {
    throw new BunqApiError(500, "", "bunq credentials row missing after write");
  }
  if ((row.bunqPermittedIps ?? []).length === 0) {
    throw new BunqApiError(
      400,
      "",
      "bunq permitted_ips must be set to explicit egress IPv4(s) before connect",
    );
  }

  const sessionStale =
    !row.bunqSessionExpiresAt ||
    row.bunqSessionExpiresAt.getTime() <= Date.now() + 60_000;

  const client = buildClientFromRow(row);
  const context = await client.ensureApiContext({
    forceNewSession: sessionStale || !row.bunqSessionToken,
  });
  await persistClientContext(workspaceId, client, context.expiresAt);
  await ensureBunqPersonalBankAccount(workspaceId);
  return getBunqSettings(workspaceId);
}

/** @deprecated Prefer connectBunq — works for sandbox and production. */
export async function connectBunqSandbox(
  workspaceId: string,
): Promise<BunqSettings> {
  return connectBunq(workspaceId);
}

export async function testBunqConnection(
  workspaceId: string,
): Promise<BunqTestConnectionResult> {
  const before = await getBunqSettings(workspaceId);
  try {
    await connectBunq(workspaceId);
    const accounts = await listBunqMonetaryAccounts(workspaceId);
    return {
      ok: true,
      error: null,
      environment: before.environment,
      accountCount: accounts.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "bunq connection failed";
    return {
      ok: false,
      error: message,
      environment: before.environment,
      accountCount: null,
    };
  }
}

/** Create a sandbox person user via official endpoint and store the API key. */
export async function provisionBunqSandboxUser(
  workspaceId: string,
  permittedIps: string[],
): Promise<BunqSettings> {
  const ips = assertBunqPermittedIps(permittedIps);
  const { apiKey } = await BunqClient.createSandboxUser();
  const { privateKeyPem } = generateBunqSigningKeyPair();
  await upsertBunqRow(workspaceId, {
    bunqApiKey: apiKey,
    bunqSigningPrivateKeyPem: privateKeyPem,
    bunqPermittedIps: ips,
    bunqInstallationToken: null,
    bunqServerPublicKeyPem: null,
    bunqSessionToken: null,
    bunqSessionExpiresAt: null,
    bunqDeviceId: null,
    bunqUserId: null,
    bunqLastConnectedAt: null,
    bunqEnvironment: BUNQ_SANDBOX_ENVIRONMENT,
  });
  await ensureBunqPersonalBankAccount(workspaceId);
  return getBunqSettings(workspaceId);
}

/** Connected client after ensureApiContext. Secrets never returned. */
export async function getConnectedBunqClient(
  workspaceId: string,
  options?: { allowPaymentWrites?: boolean },
): Promise<BunqClient> {
  const settings = await connectBunq(workspaceId);
  if (!settings.connected) {
    throw new BunqApiError(400, "", "bunq connection is not ready");
  }
  const row = await getSecretRow(workspaceId);
  if (!row) {
    throw new BunqApiError(400, "", "bunq credentials are not configured");
  }
  return buildClientFromRow(row, options);
}

/**
 * OS-167 — payment-capable client. Still uses the workspace production/sandbox
 * bunq key (no separate Ralph key). Call only after Remon approval consume.
 *
 * Local preview: when BUNQ_PAYMENT_SIMULATION=true, returns an in-process fake
 * client that never dials bunq (and refuses BUNQ_ALLOW_LIVE_PAYMENT_WRITES).
 */
export async function getConnectedBunqPaymentClient(
  workspaceId: string,
): Promise<BunqClient> {
  const { isBunqPaymentSimulationEnabled, createSimulatedBunqPaymentClient } =
    await import("../lib/bunq-payment-simulation.js");
  if (isBunqPaymentSimulationEnabled()) {
    void workspaceId;
    return createSimulatedBunqPaymentClient();
  }
  return getConnectedBunqClient(workspaceId, { allowPaymentWrites: true });
}

export async function listBunqMonetaryAccounts(
  workspaceId: string,
): Promise<BunqMonetaryAccountSummary[]> {
  const client = await getConnectedBunqClient(workspaceId);
  const accounts = await client.listMonetaryAccounts();
  return accounts.map(mapAccount);
}

export async function listBunqPayments(
  workspaceId: string,
  monetaryAccountId: string,
  options?: { count?: number },
): Promise<BunqPaymentSummary[]> {
  const client = await getConnectedBunqClient(workspaceId);
  const payments = await client.listPayments(monetaryAccountId, options);
  return payments.map(mapPayment);
}

/**
 * Official bunq sandbox funding: request-inquiry to sugardaddy@bunq.com.
 * Hard-refused when workspace environment is production.
 */
export async function fundBunqSandboxFromSugarDaddy(
  workspaceId: string,
  amountValue?: string,
): Promise<BunqSandboxFundResult> {
  const settings = await getBunqSettings(workspaceId);
  if (settings.environment !== BUNQ_SANDBOX_ENVIRONMENT) {
    throw new BunqLiveApiRefusedError(
      "Sugar Daddy sandbox-fund is sandbox-only; refused when environment=production",
    );
  }
  const client = await getConnectedBunqClient(workspaceId);
  if (client.environment !== BUNQ_SANDBOX_ENVIRONMENT) {
    throw new BunqLiveApiRefusedError(
      "Sugar Daddy request-inquiry is sandbox-only; refused on production",
    );
  }
  const accounts = await client.listMonetaryAccounts();
  const account =
    accounts.find((a) => a.status === "ACTIVE") ?? accounts[0] ?? null;
  if (!account) {
    throw new BunqApiError(
      400,
      "",
      "no bunq sandbox monetary account available to fund",
    );
  }
  const normalized = amountValue?.trim() || "25.00";
  const { requestInquiryId } =
    await client.createSandboxSugarDaddyRequestInquiry(account.id, {
      amountValue: normalized,
    });
  return {
    requestInquiryId,
    monetaryAccountId: account.id,
    amountValue: normalized.includes(".")
      ? normalized
      : Number(normalized).toFixed(2),
    currency: "EUR",
  };
}
