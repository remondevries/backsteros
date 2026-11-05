import { createHmac, timingSafeEqual } from "node:crypto";

export function getMoneybirdWebhookToken(): string | null {
  const value = process.env.MONEYBIRD_WEBHOOK_TOKEN?.trim();
  return value || null;
}

export function getMoneybirdWebhookSecret(): string | null {
  const value = process.env.MONEYBIRD_WEBHOOK_SECRET?.trim();
  return value || null;
}

export function isMoneybirdWebhookAuthConfigured(): boolean {
  return Boolean(getMoneybirdWebhookToken() || getMoneybirdWebhookSecret());
}

export function verifyMoneybirdWebhookToken(
  requestToken: string | null | undefined,
): boolean {
  const expected = getMoneybirdWebhookToken();
  if (!expected) return false;
  if (!requestToken) return false;
  const a = Buffer.from(requestToken);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify `Moneybird-Signature: t=…,v1=…` when MONEYBIRD_WEBHOOK_SECRET is set.
 * Returns true when secret is unset (token-only mode) or signature matches.
 */
export function verifyMoneybirdWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
): boolean {
  const secret = getMoneybirdWebhookSecret();
  if (!secret) return true;
  if (!signatureHeader?.trim()) return false;

  let timestamp: string | null = null;
  const digests: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (!key || value == null) continue;
    if (key === "t") timestamp = value;
    if (key === "v1") digests.push(value);
  }
  if (!timestamp || digests.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 5 * 60) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);

  return digests.some((digest) => {
    const got = Buffer.from(digest);
    return (
      got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)
    );
  });
}

/**
 * Accept when at least one configured auth method succeeds.
 * - Secret set → signature must verify.
 * - Token set (and secret unset) → payload webhook_token must match.
 * - Both set → signature must verify; token also checked when payload includes one.
 */
export function authorizeMoneybirdWebhook(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  payloadToken: string | null | undefined;
}): boolean {
  const secret = getMoneybirdWebhookSecret();
  const token = getMoneybirdWebhookToken();
  if (!secret && !token) return false;

  if (secret) {
    if (
      !verifyMoneybirdWebhookSignature(input.rawBody, input.signatureHeader)
    ) {
      return false;
    }
    if (token && input.payloadToken) {
      return verifyMoneybirdWebhookToken(input.payloadToken);
    }
    return true;
  }

  return verifyMoneybirdWebhookToken(input.payloadToken);
}
