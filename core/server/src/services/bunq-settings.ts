/**
 * bunq workspace integration settings (OS-166).
 * Secrets in workspace_integration_secrets — never PowerSync, never returned raw.
 * Sandbox-only; refuses live api.bunq.com and non-sandbox API keys.
 */

import { and, eq, isNull } from "drizzle-orm";

import type {
  BunqMonetaryAccountSummary,
  BunqPaymentSummary,
  BunqSettings,
  BunqTestConnectionResult,
  UpdateBunqSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { bankAccounts, workspaceIntegrationSecrets } from "../db/schema.js";
import {
  assertBunqPermittedIps,
  assertBunqSandboxApiKey,
  BUNQ_SANDBOX_ENVIRONMENT,
  BunqApiError,
  BunqClient,
  generateBunqSigningKeyPair,
  type BunqMonetaryAccount,
  type BunqPayment,
} from "../lib/bunq-client.js";
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
  const bankAccount = await findBunqPersonalBankAccount(workspaceId);
  return {
    environment: BUNQ_SANDBOX_ENVIRONMENT,
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
  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      bunqEnvironment: BUNQ_SANDBOX_ENVIRONMENT,
      ...patch,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        ...patch,
        bunqEnvironment: BUNQ_SANDBOX_ENVIRONMENT,
        updatedAt: new Date(),
      },
    });
}

export async function updateBunqSettings(
  workspaceId: string,
  patch: UpdateBunqSettingsInput,
): Promise<BunqSettings> {
  const current = await getSecretRow(workspaceId);
  let nextApiKey = normalizeOptionalSecret(current?.bunqApiKey);
  let nextPrivateKey = normalizeOptionalSecret(
    current?.bunqSigningPrivateKeyPem,
  );
  let nextPermittedIps = current?.bunqPermittedIps ?? [];
  let clearConnection = false;

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey.trim();
    if (!trimmed) {
      nextApiKey = null;
      clearConnection = true;
    } else {
      nextApiKey = assertBunqSandboxApiKey(trimmed);
      clearConnection = true;
    }
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

  // Production personal keys and BUNQ_PERSONAL_API_KEY are out of scope —
  // assertBunqSandboxApiKey already refuses non-sandbox_ keys.

  const writePatch: Parameters<typeof upsertBunqRow>[1] = {
    bunqApiKey: nextApiKey,
    bunqSigningPrivateKeyPem: nextPrivateKey,
    bunqPermittedIps: nextPermittedIps,
    bunqEnvironment: BUNQ_SANDBOX_ENVIRONMENT,
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

function buildClientFromRow(row: BunqSecretRow): BunqClient {
  const apiKey = normalizeOptionalSecret(row.bunqApiKey);
  const privateKey = normalizeOptionalSecret(row.bunqSigningPrivateKeyPem);
  if (!apiKey || !privateKey) {
    throw new BunqApiError(
      400,
      "",
      "bunq sandbox API key and signing private key are required",
    );
  }
  const permittedIps = assertBunqPermittedIps(row.bunqPermittedIps ?? []);
  return new BunqClient({
    apiKey,
    signingPrivateKeyPem: privateKey,
    permittedIps,
    installationToken: row.bunqInstallationToken,
    serverPublicKeyPem: row.bunqServerPublicKeyPem,
    sessionToken: row.bunqSessionToken,
    deviceId: row.bunqDeviceId,
    userId: row.bunqUserId,
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
    bunqEnvironment: BUNQ_SANDBOX_ENVIRONMENT,
  });
}

/**
 * Ensure sandbox installation/device/session. Generates a signing keypair when
 * missing so agents can connect after storing only a sandbox API key + IPs.
 */
export async function connectBunqSandbox(
  workspaceId: string,
): Promise<BunqSettings> {
  let row = await getSecretRow(workspaceId);
  if (!normalizeOptionalSecret(row?.bunqApiKey)) {
    throw new BunqApiError(400, "", "bunq sandbox API key is not configured");
  }
  if (!normalizeOptionalSecret(row?.bunqSigningPrivateKeyPem)) {
    const { privateKeyPem } = generateBunqSigningKeyPair();
    await upsertBunqRow(workspaceId, {
      bunqSigningPrivateKeyPem: privateKeyPem,
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
      "bunq permitted_ips must be set to explicit egress IP(s) before connect",
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

export async function testBunqConnection(
  workspaceId: string,
): Promise<BunqTestConnectionResult> {
  try {
    await connectBunqSandbox(workspaceId);
    const accounts = await listBunqMonetaryAccounts(workspaceId);
    return {
      ok: true,
      error: null,
      environment: BUNQ_SANDBOX_ENVIRONMENT,
      accountCount: accounts.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "bunq connection failed";
    return {
      ok: false,
      error: message,
      environment: BUNQ_SANDBOX_ENVIRONMENT,
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

/** Connected sandbox client after ensureApiContext. Secrets never returned. */
export async function getConnectedBunqClient(
  workspaceId: string,
): Promise<BunqClient> {
  const settings = await connectBunqSandbox(workspaceId);
  if (!settings.connected) {
    throw new BunqApiError(400, "", "bunq sandbox connection is not ready");
  }
  const row = await getSecretRow(workspaceId);
  if (!row) {
    throw new BunqApiError(400, "", "bunq credentials are not configured");
  }
  return buildClientFromRow(row);
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
