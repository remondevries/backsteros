import { timingSafeEqual } from "node:crypto";

export function verifyReplicationSecret(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) {
    return false;
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    // Equalize timing vs mismatched lengths.
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length).trim() || null;
}
