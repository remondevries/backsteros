/**
 * Interactive Remon step-up for bunq payment approve / reject / ack.
 * Code is a 6-digit HOTP-style truncation of HMAC-SHA256(secret, hash:timeStep)
 * so the credential is bound to the exact proposalHash (not a bare time TOTP).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const BUNQ_PAYMENT_APPROVER_STEP_MS = 30_000;

export function resolveBunqPaymentApproverTotpSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.BUNQ_PAYMENT_APPROVER_TOTP_SECRET?.trim();
  return raw || null;
}

export function computeBunqPaymentApproverCode(
  secret: string,
  proposalHash: string,
  atMs: number = Date.now(),
): string {
  const step = Math.floor(atMs / BUNQ_PAYMENT_APPROVER_STEP_MS);
  const mac = createHmac("sha256", secret)
    .update(`${proposalHash.trim().toLowerCase()}:${step}`, "utf8")
    .digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyBunqPaymentApproverCode(
  secret: string,
  proposalHash: string,
  code: string,
  atMs: number = Date.now(),
): boolean {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const provided = Buffer.from(normalized, "utf8");
  for (const skew of [-1, 0, 1] as const) {
    const expected = Buffer.from(
      computeBunqPaymentApproverCode(
        secret,
        proposalHash,
        atMs + skew * BUNQ_PAYMENT_APPROVER_STEP_MS,
      ),
      "utf8",
    );
    if (
      expected.length === provided.length &&
      timingSafeEqual(expected, provided)
    ) {
      return true;
    }
  }
  return false;
}
