/**
 * Mint TransIP access tokens (JWTs) from login + private key.
 * @see https://api.transip.eu/rest/docs.html#tag/Auth
 */

import crypto from "node:crypto";

import { TransipApiError } from "./transip-client.js";

const TRANSIP_AUTH_URL = "https://api.transip.nl/v6/auth";

/** Refresh when fewer than this many ms remain on the cached JWT. */
export const TRANSIP_TOKEN_REFRESH_SKEW_MS = 2 * 24 * 60 * 60 * 1000;

export type CreateTransipAccessTokenInput = {
  login: string;
  privateKey: string;
  /** Max is 1 month per TransIP. */
  expirationTime?: string;
  readOnly?: boolean;
  globalKey?: boolean;
  label?: string;
  fetchImpl?: typeof fetch;
};

export type CreatedTransipAccessToken = {
  token: string;
  expiresAt: Date | null;
};

/** Normalize PEM pasted from the TransIP control panel. */
export function normalizeTransipPrivateKey(pem: string): string {
  const trimmed = pem.trim();
  const match = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]*?)-----END (RSA )?PRIVATE KEY-----/u.exec(
    trimmed,
  );
  if (!match) {
    throw new TransipApiError(
      400,
      "transip_private_key_invalid",
      "Could not find a valid TransIP private key (PEM).",
    );
  }
  const body = match[2]!.replace(/\s+/gu, "");
  const chunked = body.match(/.{1,64}/gu)?.join("\n") ?? body;
  // Node accepts PKCS#8 ("PRIVATE KEY") and PKCS#1 ("RSA PRIVATE KEY").
  const begin = match[1] ? "RSA PRIVATE KEY" : "PRIVATE KEY";
  return `-----BEGIN ${begin}-----\n${chunked}\n-----END ${begin}-----`;
}

export function createTransipAuthSignature(
  requestBody: string,
  privateKeyPem: string,
): string {
  const key = normalizeTransipPrivateKey(privateKeyPem);
  const signer = crypto.createSign("RSA-SHA512");
  signer.update(requestBody);
  signer.end();
  return signer.sign(key, "base64");
}

/** Read JWT `exp` (seconds) without verifying signature. */
export function readJwtExpiryMs(token: string): number | null {
  const parts = token.trim().split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function isTransipAccessTokenFresh(
  expiresAt: Date | string | number | null | undefined,
  nowMs: number = Date.now(),
  skewMs: number = TRANSIP_TOKEN_REFRESH_SKEW_MS,
): boolean {
  if (expiresAt == null) return false;
  const ms =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === "number"
        ? expiresAt
        : new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return false;
  return ms - nowMs > skewMs;
}

/**
 * POST /v6/auth — sign the JSON body with the API private key and return a JWT.
 */
export async function createTransipAccessToken(
  input: CreateTransipAccessTokenInput,
): Promise<CreatedTransipAccessToken> {
  const login = input.login.trim();
  if (!login) {
    throw new TransipApiError(
      400,
      "transip_login_missing",
      "TransIP login is required to mint an access token.",
    );
  }
  const privateKey = input.privateKey.trim();
  if (!privateKey) {
    throw new TransipApiError(
      400,
      "transip_private_key_missing",
      "TransIP private key is required to mint an access token.",
    );
  }

  const requestBody = JSON.stringify({
    login,
    nonce: crypto.randomBytes(12).toString("hex"),
    read_only: input.readOnly === true,
    expiration_time: input.expirationTime?.trim() || "1 month",
    label: input.label?.trim() || `backsteros-${Date.now()}`,
    // Local core often runs off-whitelist IPs.
    global_key: input.globalKey !== false,
  });

  let signature: string;
  try {
    signature = createTransipAuthSignature(requestBody, privateKey);
  } catch (error) {
    if (error instanceof TransipApiError) throw error;
    throw new TransipApiError(
      400,
      "transip_private_key_invalid",
      error instanceof Error
        ? error.message
        : "The provided TransIP private key is invalid.",
    );
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(TRANSIP_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Signature: signature,
    },
    body: requestBody,
  });

  const text = await response.text();
  let json: { token?: unknown; error?: unknown } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    // Fall through with empty json.
  }

  if (!response.ok) {
    const message =
      typeof json.error === "string" && json.error.trim()
        ? json.error.trim()
        : text.trim() || `TransIP auth failed (${response.status})`;
    throw new TransipApiError(
      response.status,
      response.status === 401 || response.status === 403
        ? "transip_auth_failed"
        : "transip_api_error",
      message,
    );
  }

  const token = typeof json.token === "string" ? json.token.trim() : "";
  if (!token) {
    throw new TransipApiError(
      502,
      "transip_api_error",
      "TransIP auth response did not include a token.",
    );
  }

  const expMs = readJwtExpiryMs(token);
  return {
    token,
    expiresAt: expMs != null ? new Date(expMs) : null,
  };
}
