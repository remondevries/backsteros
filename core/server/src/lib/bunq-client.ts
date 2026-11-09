/**
 * Thin bunq REST client — OS-166 read surface + OS-167 gated single payment.
 *
 * Auth sequence (official docs):
 * 1. POST /installation (client public key) → installation token + server public key
 * 2. POST /device-server (API key + permitted_ips) → device id
 * 3. POST /session-server → short-lived session token
 *
 * Dual environment (explicit allowlist — no silent toggle):
 * - sandbox → https://public-api.sandbox.bunq.com/v1 + sandbox_… keys only
 * - production → https://api.bunq.com/v1 + non-sandbox keys only
 *
 * Default client is read-only (monetary-account + payment GETs). Payment POSTs
 * require `allowPaymentWrites: true` and still refuse drafts / schedule / bulk /
 * card / mandate / webhook / account mutations. Live production payment HTTP is
 * additionally refused in tests and unless BUNQ_ALLOW_LIVE_PAYMENT_WRITES=true.
 * Sugar Daddy request-inquiry remains sandbox-only.
 *
 * @see https://doc.bunq.com/tutorials/your-first-payment/creating-the-api-context
 * @see https://doc.bunq.com/basics/getting-started
 */

import {
  createPublicKey,
  createSign,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";

import {
  assertValidBunqIban,
  isBunqLivePaymentWriteAllowed,
  normalizeBunqAmountValue,
  normalizeBunqCurrency,
  normalizeBunqMemo,
  normalizeBunqMonetaryAccountId,
  normalizeBunqRecipientName,
} from "./bunq-payment-proposal.js";

export const BUNQ_SANDBOX_API_BASE = "https://public-api.sandbox.bunq.com/v1";
export const BUNQ_PRODUCTION_API_BASE = "https://api.bunq.com/v1";
export const BUNQ_LIVE_API_HOST = "api.bunq.com";
export const BUNQ_SANDBOX_ENVIRONMENT = "sandbox" as const;
export const BUNQ_PRODUCTION_ENVIRONMENT = "production" as const;

export type BunqEnvironment =
  | typeof BUNQ_SANDBOX_ENVIRONMENT
  | typeof BUNQ_PRODUCTION_ENVIRONMENT;

/** Sandbox keys use a `sandbox_` prefix. */
export const BUNQ_SANDBOX_API_KEY_PREFIX = "sandbox_";

const IPV4_EXACT =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

export type BunqAmount = {
  value: string;
  currency: string;
};

export type BunqMonetaryAccount = {
  id: string;
  description: string | null;
  balance: BunqAmount | null;
  currency: string | null;
  status: string | null;
  iban: string | null;
};

export type BunqPayment = {
  id: string;
  created: string | null;
  updated: string | null;
  amount: BunqAmount | null;
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  type: string | null;
  subType: string | null;
};

export type BunqInstallationResult = {
  installationToken: string;
  serverPublicKeyPem: string;
};

export type BunqSessionResult = {
  sessionToken: string;
  userId: string;
  /** Session expiry hint; bunq auto-logout driven — callers may refresh earlier. */
  expiresAt: Date | null;
};

export type BunqSandboxUserResult = {
  apiKey: string;
};

export class BunqApiError extends Error {
  readonly status: number;
  /** Raw bunq HTTP body — never log or return to clients; use {@link code}/message. */
  readonly body: string;
  /** Stable machine code for UI / API consumers (sanitized). */
  readonly code: string | null;

  constructor(
    status: number,
    body: string,
    message?: string,
    code: string | null = null,
  ) {
    super(message ?? `bunq API error ${status}`);
    this.name = "BunqApiError";
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

/** Extract bunq `Error[].error_description` strings; never returns tokens/keys. */
export function extractBunqErrorDescriptions(body: string): string[] {
  if (!body.trim()) return [];
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const errors = (parsed as { Error?: unknown }).Error;
    if (!Array.isArray(errors)) return [];
    const out: string[] = [];
    for (const entry of errors) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const desc =
        typeof record.error_description === "string"
          ? record.error_description
          : typeof record.error_description_translated === "string"
            ? record.error_description_translated
            : null;
      if (!desc?.trim()) continue;
      // Hard strip anything that looks like a secret fragment.
      const cleaned = desc
        .trim()
        .replace(/sk_[A-Za-z0-9_\-]+/g, "[redacted]")
        .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted]")
        .slice(0, 240);
      if (cleaned) out.push(cleaned);
    }
    return out;
  } catch {
    return [];
  }
}

export type FormattedBunqHttpFailure = {
  message: string;
  code: string;
};

/**
 * Build a safe user-facing message from a bunq HTTP failure.
 * Prefer official error_description; map known auth failures to reconnect guidance.
 */
export function formatBunqHttpFailure(
  method: string,
  path: string,
  status: number,
  body: string,
): FormattedBunqHttpFailure {
  const descriptions = extractBunqErrorDescriptions(body);
  const primary = descriptions[0] ?? null;
  const authRejected =
    status === 400 &&
    primary != null &&
    /incorrect api key or ip address/i.test(primary);

  if (authRejected) {
    return {
      code: "bunq_auth_rejected",
      message:
        "bunq rejected the API key or egress IP. Update the key or permitted IPs in Settings → bunq, then reconnect. Cached transactions stay available until sync succeeds.",
    };
  }

  if (primary) {
    return {
      code: "bunq_api_error",
      message: `bunq ${method} ${path} failed (${status}): ${primary}`,
    };
  }

  return {
    code: "bunq_api_error",
    message: `bunq ${method} ${path} failed (${status})`,
  };
}

export class BunqLiveApiRefusedError extends Error {
  constructor(detail: string) {
    super(`bunq live API refused: ${detail}`);
    this.name = "BunqLiveApiRefusedError";
  }
}

export type BunqFetch = typeof fetch;

export type BunqCreatePaymentInput = {
  monetaryAccountId: string;
  amountValue: string;
  amountCurrency: string;
  recipientName: string;
  recipientIban: string;
  description: string;
  /**
   * Official X-Bunq-Client-Idempotency-Key (UUID recommended).
   * NOT X-Bunq-Client-Request-Id — that header is not idempotent.
   */
  idempotencyKey: string;
};

/**
 * Payment HTTP outcome is unknown (timeout, 5xx, connection drop). Callers must
 * mark needs_reconciliation — never assume the transfer did not land.
 */
export class BunqPaymentAmbiguousOutcomeError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "BunqPaymentAmbiguousOutcomeError";
    this.status = status;
  }
}

/** 409 from bunq idempotency key — payment may already exist for this key. */
export class BunqPaymentIdempotencyConflictError extends Error {
  readonly status = 409;
  readonly body: string;

  constructor(body: string, message?: string) {
    super(
      message ??
        "bunq payment idempotency conflict (409) — reconcile before a new key",
    );
    this.name = "BunqPaymentIdempotencyConflictError";
    this.body = body;
  }
}

export type BunqClientOptions = {
  /**
   * Explicit environment. Selects the allowed API host + key rules.
   * Defaults to sandbox (unchanged OS-166 default).
   */
  environment?: BunqEnvironment;
  /** Must match `environment` allowlist; defaults from environment. */
  baseUrl?: string;
  apiKey: string;
  signingPrivateKeyPem: string;
  installationToken?: string | null;
  serverPublicKeyPem?: string | null;
  sessionToken?: string | null;
  deviceId?: string | null;
  userId?: string | null;
  permittedIps: string[];
  /** Optional description registered on device-server. */
  deviceDescription?: string;
  /**
   * OS-167 — opt-in single-transfer POST /payment. Default false keeps the
   * OS-166 read-only client behavior for sync / settings / list routes.
   */
  allowPaymentWrites?: boolean;
  fetchImpl?: BunqFetch;
};

export function bunqApiBaseForEnvironment(
  environment: BunqEnvironment,
): string {
  return environment === BUNQ_PRODUCTION_ENVIRONMENT
    ? BUNQ_PRODUCTION_API_BASE
    : BUNQ_SANDBOX_API_BASE;
}

export function assertBunqEnvironment(
  value: string | null | undefined,
): BunqEnvironment {
  const trimmed = value?.trim();
  if (
    trimmed === BUNQ_SANDBOX_ENVIRONMENT ||
    trimmed === BUNQ_PRODUCTION_ENVIRONMENT
  ) {
    return trimmed;
  }
  throw new BunqLiveApiRefusedError(
    `bunq environment must be "sandbox" or "production" (got ${value ?? "empty"})`,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function responseItems(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const response = root?.Response;
  if (!Array.isArray(response)) return [];
  return response
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null);
}

function findResponseObject(
  payload: unknown,
  key: string,
): Record<string, unknown> | null {
  for (const entry of responseItems(payload)) {
    const nested = asRecord(entry[key]);
    if (nested) return nested;
  }
  return null;
}

export function assertBunqBaseUrl(
  baseUrl: string,
  environment: BunqEnvironment,
): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new BunqLiveApiRefusedError(`invalid base URL: ${baseUrl}`);
  }
  const host = url.hostname.toLowerCase();
  if (environment === BUNQ_SANDBOX_ENVIRONMENT) {
    if (host === BUNQ_LIVE_API_HOST || host.endsWith(`.${BUNQ_LIVE_API_HOST}`)) {
      throw new BunqLiveApiRefusedError(
        "https://api.bunq.com/v1/ is disabled on the sandbox path — set environment=production to use live bunq (read-only)",
      );
    }
    if (!host.includes("sandbox") || !host.endsWith(".bunq.com")) {
      throw new BunqLiveApiRefusedError(
        `sandbox path only allows ${BUNQ_SANDBOX_API_BASE} (got ${host})`,
      );
    }
    return url;
  }
  // production allowlist — exact live host only
  if (host !== BUNQ_LIVE_API_HOST) {
    throw new BunqLiveApiRefusedError(
      `production path only allows ${BUNQ_PRODUCTION_API_BASE} (got ${host})`,
    );
  }
  if (host.includes("sandbox")) {
    throw new BunqLiveApiRefusedError(
      "sandbox API host is refused on the production path",
    );
  }
  return url;
}

/** @deprecated Prefer assertBunqBaseUrl(url, "sandbox"). Kept for call-site clarity. */
export function assertBunqSandboxBaseUrl(baseUrl: string): URL {
  return assertBunqBaseUrl(baseUrl, BUNQ_SANDBOX_ENVIRONMENT);
}

export function assertBunqApiKey(
  apiKey: string,
  environment: BunqEnvironment,
): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new BunqApiError(400, "", "bunq API key is required");
  }
  // Never accept the well-known production env name as a secret value.
  if (trimmed === "BUNQ_PERSONAL_API_KEY") {
    throw new BunqLiveApiRefusedError(
      "BUNQ_PERSONAL_API_KEY must never be used as the API key value",
    );
  }
  if (environment === BUNQ_SANDBOX_ENVIRONMENT) {
    if (!trimmed.startsWith(BUNQ_SANDBOX_API_KEY_PREFIX)) {
      throw new BunqLiveApiRefusedError(
        "sandbox path only accepts sandbox_… API keys; production keys are refused",
      );
    }
    return trimmed;
  }
  if (trimmed.startsWith(BUNQ_SANDBOX_API_KEY_PREFIX)) {
    throw new BunqLiveApiRefusedError(
      "production path refuses sandbox_… API keys; use a live bunq API key",
    );
  }
  return trimmed;
}

/** @deprecated Prefer assertBunqApiKey(key, "sandbox"). */
export function assertBunqSandboxApiKey(apiKey: string): string {
  return assertBunqApiKey(apiKey, BUNQ_SANDBOX_ENVIRONMENT);
}

/**
 * Exact IPv4 strings only — no wildcards, no CIDR, no IPv6.
 * Primary cloud-core egress for live bunq: 188.34.196.92.
 */
export function assertBunqPermittedIps(ips: string[]): string[] {
  const cleaned = ips.map((ip) => ip.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new BunqApiError(
      400,
      "",
      "bunq permitted_ips must include at least one explicit IPv4 address",
    );
  }
  for (const ip of cleaned) {
    if (ip === "*" || ip.includes("*")) {
      throw new BunqApiError(
        400,
        "",
        "bunq permitted_ips must not use wildcards (*); use explicit egress IPv4 only",
      );
    }
    if (ip.includes("/") || ip.includes(":")) {
      throw new BunqApiError(
        400,
        "",
        "bunq permitted_ips must be exact IPv4 addresses (no CIDR, no IPv6)",
      );
    }
    if (!IPV4_EXACT.test(ip)) {
      throw new BunqApiError(
        400,
        "",
        `bunq permitted_ips entry is not a valid IPv4 address: ${ip}`,
      );
    }
  }
  return cleaned;
}

export function generateBunqSigningKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

export function publicKeyPemFromPrivateKeyPem(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem).export({
    type: "spki",
    format: "pem",
  }) as string;
}

export function signBunqRequestBody(
  privateKeyPem: string,
  body: string,
): string {
  const signer = createSign("SHA256");
  signer.update(body);
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

export function mapBunqAmount(raw: unknown): BunqAmount | null {
  const record = asRecord(raw);
  if (!record) return null;
  const value = asString(record.value);
  const currency = asString(record.currency);
  if (!value || !currency) return null;
  return { value, currency };
}

function aliasIban(alias: unknown): string | null {
  const record = asRecord(alias);
  if (!record) return null;
  if (asString(record.type)?.toUpperCase() === "IBAN") {
    return asString(record.value);
  }
  return asString(record.iban) ?? asString(record.value);
}

function aliasDisplayName(alias: unknown): string | null {
  const record = asRecord(alias);
  if (!record) return null;
  return (
    asString(record.display_name) ??
    asString(record.public_nick_name) ??
    asString(record.name)
  );
}

export function mapBunqMonetaryAccount(raw: unknown): BunqMonetaryAccount | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = asString(record.id);
  if (!id) return null;
  const alias = Array.isArray(record.alias) ? record.alias : [];
  const iban =
    alias.map(aliasIban).find((value): value is string => Boolean(value)) ??
    null;
  return {
    id,
    description: asString(record.description),
    balance: mapBunqAmount(record.balance),
    currency: asString(record.currency) ?? mapBunqAmount(record.balance)?.currency ?? null,
    status: asString(record.status),
    iban,
  };
}

export function mapBunqPayment(raw: unknown): BunqPayment | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = asString(record.id);
  if (!id) return null;
  const counterparty = record.counterparty_alias;
  return {
    id,
    created: asString(record.created),
    updated: asString(record.updated),
    amount: mapBunqAmount(record.amount),
    description: asString(record.description),
    counterpartyName: aliasDisplayName(counterparty),
    counterpartyIban: aliasIban(counterparty),
    type: asString(record.type),
    subType: asString(record.sub_type),
  };
}

function extractMonetaryAccounts(payload: unknown): BunqMonetaryAccount[] {
  const accounts: BunqMonetaryAccount[] = [];
  for (const entry of responseItems(payload)) {
    for (const key of Object.keys(entry)) {
      if (!key.startsWith("MonetaryAccount")) continue;
      const mapped = mapBunqMonetaryAccount(entry[key]);
      if (mapped) accounts.push(mapped);
    }
  }
  return accounts;
}

function extractPayments(payload: unknown): BunqPayment[] {
  const payments: BunqPayment[] = [];
  for (const entry of responseItems(payload)) {
    const payment = asRecord(entry.Payment);
    const mapped = mapBunqPayment(payment);
    if (mapped) payments.push(mapped);
  }
  return payments;
}

export class BunqClient {
  readonly environment: BunqEnvironment;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly signingPrivateKeyPem: string;
  private readonly publicKeyPem: string;
  private readonly permittedIps: string[];
  private readonly deviceDescription: string;
  private readonly fetchImpl: BunqFetch;
  private readonly allowPaymentWrites: boolean;

  installationToken: string | null;
  serverPublicKeyPem: string | null;
  sessionToken: string | null;
  deviceId: string | null;
  userId: string | null;

  constructor(options: BunqClientOptions) {
    this.environment = assertBunqEnvironment(
      options.environment ?? BUNQ_SANDBOX_ENVIRONMENT,
    );
    const base = assertBunqBaseUrl(
      options.baseUrl ?? bunqApiBaseForEnvironment(this.environment),
      this.environment,
    );
    this.baseUrl = base.toString().replace(/\/$/, "");
    this.apiKey = assertBunqApiKey(options.apiKey, this.environment);
    this.signingPrivateKeyPem = options.signingPrivateKeyPem.trim();
    if (!this.signingPrivateKeyPem.includes("PRIVATE KEY")) {
      throw new BunqApiError(400, "", "bunq signing private key PEM is required");
    }
    this.publicKeyPem = publicKeyPemFromPrivateKeyPem(this.signingPrivateKeyPem);
    this.permittedIps = assertBunqPermittedIps(options.permittedIps);
    this.allowPaymentWrites = options.allowPaymentWrites === true;
    this.deviceDescription =
      options.deviceDescription?.trim() ||
      (this.environment === BUNQ_PRODUCTION_ENVIRONMENT
        ? this.allowPaymentWrites
          ? "BacksterOS finance payments"
          : "BacksterOS read-only finance"
        : this.allowPaymentWrites
          ? "BacksterOS bunq sandbox"
          : "BacksterOS bunq sandbox (read-only)");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.installationToken = options.installationToken?.trim() || null;
    this.serverPublicKeyPem = options.serverPublicKeyPem?.trim() || null;
    this.sessionToken = options.sessionToken?.trim() || null;
    this.deviceId = options.deviceId?.trim() || null;
    this.userId = options.userId?.trim() || null;
  }

  /** Create a sandbox person user and return the API key (sandbox host only). */
  static async createSandboxUser(
    fetchImpl: BunqFetch = fetch,
    baseUrl: string = BUNQ_SANDBOX_API_BASE,
  ): Promise<BunqSandboxUserResult> {
    assertBunqSandboxBaseUrl(baseUrl);
    const url = `${baseUrl.replace(/\/$/, "")}/sandbox-user-person`;
    const body = "{}";
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "BacksterOS-bunq-sandbox/1.0",
        "X-Bunq-Client-Request-Id": randomUUID(),
        "X-Bunq-Language": "en_US",
        "X-Bunq-Region": "nl_NL",
        "X-Bunq-Geolocation": "0 0 0 0 000",
      },
      body,
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new BunqApiError(
        response.status,
        text,
        `bunq sandbox-user-person failed (${response.status})`,
      );
    }
    const apiKeyObj = findResponseObject(payload, "ApiKey");
    const apiKey = asString(apiKeyObj?.api_key);
    if (!apiKey) {
      throw new BunqApiError(
        502,
        text,
        "bunq sandbox-user-person response missing ApiKey",
      );
    }
    return { apiKey: assertBunqSandboxApiKey(apiKey) };
  }

  async createInstallation(): Promise<BunqInstallationResult> {
    const body = JSON.stringify({
      client_public_key: this.publicKeyPem,
    });
    const payload = await this.requestJson("POST", "/installation", body, {
      auth: "none",
      sign: false,
    });
    const tokenObj = findResponseObject(payload, "Token");
    const serverKeyObj = findResponseObject(payload, "ServerPublicKey");
    const installationToken = asString(tokenObj?.token);
    const serverPublicKeyPem = asString(serverKeyObj?.server_public_key);
    if (!installationToken || !serverPublicKeyPem) {
      throw new BunqApiError(
        502,
        JSON.stringify(payload),
        "bunq installation response missing Token or ServerPublicKey",
      );
    }
    this.installationToken = installationToken;
    this.serverPublicKeyPem = serverPublicKeyPem;
    return { installationToken, serverPublicKeyPem };
  }

  async createDeviceServer(): Promise<string> {
    if (!this.installationToken) {
      throw new BunqApiError(400, "", "bunq installation token is required");
    }
    const body = JSON.stringify({
      description: this.deviceDescription,
      secret: this.apiKey,
      permitted_ips: this.permittedIps,
    });
    const payload = await this.requestJson("POST", "/device-server", body, {
      auth: "installation",
      sign: true,
    });
    const idObj = findResponseObject(payload, "Id");
    const deviceId = asString(idObj?.id);
    if (!deviceId) {
      throw new BunqApiError(
        502,
        JSON.stringify(payload),
        "bunq device-server response missing Id",
      );
    }
    this.deviceId = deviceId;
    return deviceId;
  }

  async createSession(): Promise<BunqSessionResult> {
    if (!this.installationToken) {
      throw new BunqApiError(400, "", "bunq installation token is required");
    }
    const body = JSON.stringify({ secret: this.apiKey });
    const payload = await this.requestJson("POST", "/session-server", body, {
      auth: "installation",
      sign: true,
    });
    const tokenObj = findResponseObject(payload, "Token");
    const sessionToken = asString(tokenObj?.token);
    let userId: string | null = null;
    for (const entry of responseItems(payload)) {
      for (const key of Object.keys(entry)) {
        if (!key.startsWith("User")) continue;
        const user = asRecord(entry[key]);
        userId = asString(user?.id);
        if (userId) break;
      }
      if (userId) break;
    }
    if (!sessionToken || !userId) {
      throw new BunqApiError(
        502,
        JSON.stringify(payload),
        "bunq session-server response missing Token or User",
      );
    }
    this.sessionToken = sessionToken;
    this.userId = userId;
    // bunq extends sessions near expiry; we refresh proactively after 24h when unknown.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { sessionToken, userId, expiresAt };
  }

  /**
   * Ensure installation + device + session exist. Reuses durable installation
   * token when present; always refreshes session when missing/forced.
   */
  async ensureApiContext(options?: {
    forceNewSession?: boolean;
  }): Promise<{
    installationToken: string;
    serverPublicKeyPem: string;
    deviceId: string;
    sessionToken: string;
    userId: string;
    expiresAt: Date | null;
  }> {
    if (!this.installationToken || !this.serverPublicKeyPem) {
      await this.createInstallation();
    }
    if (!this.deviceId) {
      await this.createDeviceServer();
    }
    if (!this.sessionToken || !this.userId || options?.forceNewSession) {
      const session = await this.createSession();
      return {
        installationToken: this.installationToken!,
        serverPublicKeyPem: this.serverPublicKeyPem!,
        deviceId: this.deviceId!,
        sessionToken: session.sessionToken,
        userId: session.userId,
        expiresAt: session.expiresAt,
      };
    }
    return {
      installationToken: this.installationToken!,
      serverPublicKeyPem: this.serverPublicKeyPem!,
      deviceId: this.deviceId!,
      sessionToken: this.sessionToken,
      userId: this.userId,
      expiresAt: null,
    };
  }

  async listMonetaryAccounts(): Promise<BunqMonetaryAccount[]> {
    const userId = this.requireUserId();
    const payload = await this.requestJson(
      "GET",
      `/user/${encodeURIComponent(userId)}/monetary-account`,
      "",
      { auth: "session", sign: false },
    );
    return extractMonetaryAccounts(payload);
  }

  async listPayments(
    monetaryAccountId: string,
    options?: { count?: number; olderId?: string },
  ): Promise<BunqPayment[]> {
    const userId = this.requireUserId();
    const count = Math.min(Math.max(options?.count ?? 50, 1), 200);
    const params = new URLSearchParams({ count: String(count) });
    if (options?.olderId?.trim()) {
      params.set("older_id", options.olderId.trim());
    }
    const path =
      `/user/${encodeURIComponent(userId)}` +
      `/monetary-account/${encodeURIComponent(monetaryAccountId)}` +
      `/payment?${params.toString()}`;
    const payload = await this.requestJson("GET", path, "", {
      auth: "session",
      sign: false,
    });
    return extractPayments(payload);
  }

  /** Paginate payments newest→oldest until empty or maxPages. */
  async listAllPayments(
    monetaryAccountId: string,
    options?: { pageSize?: number; maxPages?: number },
  ): Promise<BunqPayment[]> {
    const pageSize = Math.min(Math.max(options?.pageSize ?? 200, 1), 200);
    const maxPages = Math.min(Math.max(options?.maxPages ?? 25, 1), 100);
    const all: BunqPayment[] = [];
    let olderId: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const batch = await this.listPayments(monetaryAccountId, {
        count: pageSize,
        olderId,
      });
      if (batch.length === 0) break;
      all.push(...batch);
      const lastId = batch[batch.length - 1]?.id;
      if (!lastId || batch.length < pageSize) break;
      olderId = lastId;
    }
    return all;
  }

  /**
   * OS-167 — narrowly validated single SEPA/bunq payment.
   * Refuses unless `allowPaymentWrites` was set. Never creates drafts,
   * schedules, bulk payments, cards, mandates, webhooks, or account changes.
   * Production live HTTP additionally requires BUNQ_ALLOW_LIVE_PAYMENT_WRITES
   * and is hard-refused when NODE_ENV=test.
   */
  async createPayment(
    input: BunqCreatePaymentInput,
  ): Promise<{ paymentId: string }> {
    if (!this.allowPaymentWrites) {
      throw new BunqLiveApiRefusedError(
        "bunq payment writes are disabled on this client (read-only)",
      );
    }
    assertBunqBaseUrl(this.baseUrl, this.environment);
    if (this.environment === BUNQ_PRODUCTION_ENVIRONMENT) {
      if (!isBunqLivePaymentWriteAllowed()) {
        throw new BunqLiveApiRefusedError(
          "live bunq payment writes refused (tests, or BUNQ_ALLOW_LIVE_PAYMENT_WRITES not set)",
        );
      }
    }

    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new BunqApiError(
        400,
        "",
        "bunq payment idempotency key (X-Bunq-Client-Idempotency-Key) is required",
      );
    }

    const monetaryAccountId = normalizeBunqMonetaryAccountId(
      input.monetaryAccountId,
    );
    const amountValue = normalizeBunqAmountValue(input.amountValue);
    const amountCurrency = normalizeBunqCurrency(input.amountCurrency);
    const recipientName = normalizeBunqRecipientName(input.recipientName);
    const recipientIban = assertValidBunqIban(input.recipientIban);
    const description = normalizeBunqMemo(input.description);

    const userId = this.requireUserId();
    const body = JSON.stringify({
      amount: {
        value: amountValue,
        currency: amountCurrency,
      },
      counterparty_alias: {
        type: "IBAN",
        value: recipientIban,
        name: recipientName,
      },
      description,
    });
    const path =
      `/user/${encodeURIComponent(userId)}` +
      `/monetary-account/${encodeURIComponent(monetaryAccountId)}` +
      `/payment`;
    let payload: unknown;
    try {
      payload = await this.requestJson("POST", path, body, {
        auth: "session",
        sign: true,
        idempotencyKey,
      });
    } catch (error) {
      if (
        error instanceof BunqPaymentAmbiguousOutcomeError ||
        error instanceof BunqPaymentIdempotencyConflictError ||
        error instanceof BunqLiveApiRefusedError
      ) {
        throw error;
      }
      if (error instanceof BunqApiError) {
        if (error.status === 409) {
          throw new BunqPaymentIdempotencyConflictError(error.body, error.message);
        }
        if (error.status >= 500 || error.status === 408 || error.status === 429) {
          throw new BunqPaymentAmbiguousOutcomeError(error.message, error.status);
        }
        throw error;
      }
      throw new BunqPaymentAmbiguousOutcomeError(
        error instanceof Error ? error.message : "bunq payment transport failure",
      );
    }
    const idObj = findResponseObject(payload, "Id");
    const paymentId = asString(idObj?.id);
    if (!paymentId) {
      // HTTP looked OK but body unusable — treat as unknown outcome.
      throw new BunqPaymentAmbiguousOutcomeError(
        "bunq payment response missing Id after accepted HTTP",
        502,
      );
    }
    return { paymentId };
  }

  /**
   * Official sandbox funding path: request money from Sugar Daddy
   * (`sugardaddy@bunq.com`). Auto-approves up to €500 per request. Sandbox
   * host only — never a production payment write.
   */
  async createSandboxSugarDaddyRequestInquiry(
    monetaryAccountId: string,
    options?: { amountValue?: string; description?: string },
  ): Promise<{ requestInquiryId: string }> {
    if (this.environment !== BUNQ_SANDBOX_ENVIRONMENT) {
      throw new BunqLiveApiRefusedError(
        "Sugar Daddy request-inquiry is sandbox-only; refused on production",
      );
    }
    assertBunqBaseUrl(this.baseUrl, BUNQ_SANDBOX_ENVIRONMENT);
    const userId = this.requireUserId();
    const amountValue = (options?.amountValue ?? "25.00").trim();
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 500) {
      throw new BunqApiError(
        400,
        "",
        "sandbox Sugar Daddy amount must be between 0.01 and 500.00 EUR",
      );
    }
    const body = JSON.stringify({
      amount_inquired: {
        value: amountValue.includes(".")
          ? amountValue
          : amount.toFixed(2),
        currency: "EUR",
      },
      counterparty_alias: {
        type: "EMAIL",
        value: "sugardaddy@bunq.com",
        name: "Sugar Daddy",
      },
      description:
        options?.description?.trim() ||
        "BacksterOS sandbox ledger test (Sugar Daddy)",
      allow_bunqme: false,
    });
    const path =
      `/user/${encodeURIComponent(userId)}` +
      `/monetary-account/${encodeURIComponent(monetaryAccountId)}` +
      `/request-inquiry`;
    const payload = await this.requestJson("POST", path, body, {
      auth: "session",
      sign: true,
    });
    const idObj = findResponseObject(payload, "Id");
    const requestInquiryId = asString(idObj?.id);
    if (!requestInquiryId) {
      throw new BunqApiError(
        502,
        JSON.stringify(payload),
        "bunq request-inquiry response missing Id",
      );
    }
    return { requestInquiryId };
  }

  private requireUserId(): string {
    if (!this.userId) {
      throw new BunqApiError(400, "", "bunq user id is required (open a session)");
    }
    if (!this.sessionToken) {
      throw new BunqApiError(400, "", "bunq session token is required");
    }
    return this.userId;
  }

  private async requestJson(
    method: "GET" | "POST",
    path: string,
    body: string,
    options: {
      auth: "none" | "installation" | "session";
      sign: boolean;
      /** Official payment idempotency — never reuse Request-Id for this. */
      idempotencyKey?: string;
    },
  ): Promise<unknown> {
    // Re-check on every request so environment/host can never drift.
    assertBunqBaseUrl(this.baseUrl, this.environment);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "User-Agent":
        this.environment === BUNQ_PRODUCTION_ENVIRONMENT
          ? "BacksterOS-bunq-readonly/1.0"
          : "BacksterOS-bunq-sandbox/1.0",
      // Per bunq docs: Request-Id is NOT idempotent — unique per attempt.
      "X-Bunq-Client-Request-Id": randomUUID(),
      "X-Bunq-Language": "en_US",
      "X-Bunq-Region": "nl_NL",
      "X-Bunq-Geolocation": "0 0 0 0 000",
    };

    if (options.idempotencyKey?.trim()) {
      headers["X-Bunq-Client-Idempotency-Key"] = options.idempotencyKey.trim();
    }

    if (options.auth === "installation") {
      if (!this.installationToken) {
        throw new BunqApiError(400, "", "bunq installation token is required");
      }
      headers["X-Bunq-Client-Authentication"] = this.installationToken;
    } else if (options.auth === "session") {
      if (!this.sessionToken) {
        throw new BunqApiError(400, "", "bunq session token is required");
      }
      headers["X-Bunq-Client-Authentication"] = this.sessionToken;
    }

    if (options.sign) {
      headers["X-Bunq-Client-Signature"] = signBunqRequestBody(
        this.signingPrivateKeyPem,
        body,
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : body,
      });
    } catch (error) {
      if (options.idempotencyKey) {
        throw new BunqPaymentAmbiguousOutcomeError(
          error instanceof Error
            ? error.message
            : "bunq payment fetch failed before response",
        );
      }
      throw error;
    }
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const formatted = formatBunqHttpFailure(method, path, response.status, text);
      throw new BunqApiError(
        response.status,
        text,
        formatted.message,
        formatted.code,
      );
    }
    return payload;
  }
}
