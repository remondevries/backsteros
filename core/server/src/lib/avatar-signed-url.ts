import { createHmac, timingSafeEqual } from "node:crypto";

export const AVATAR_SIGNED_URL_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AVATAR_SIGNED_URL_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AvatarSignedEntityType = "contact" | "organization" | "bank_account";

export type AvatarSignedPayload = {
  workspaceId: string;
  entityType: AvatarSignedEntityType;
  entityId: string;
  exp: number;
};

const ENTITY_TYPES = new Set<AvatarSignedEntityType>([
  "contact",
  "organization",
  "bank_account",
]);

export function isAvatarSignedEntityType(
  value: string,
): value is AvatarSignedEntityType {
  return ENTITY_TYPES.has(value as AvatarSignedEntityType);
}

export function getAvatarUrlSigningSecret(): string | null {
  const secret = process.env.AVATAR_URL_SIGNING_SECRET?.trim();
  return secret || null;
}

/** Absolute origin for minted avatar URLs (no trailing slash). */
export function getPublicApiOrigin(): string | null {
  const raw =
    process.env.PUBLIC_API_URL?.trim() ||
    process.env.BACKSTEROS_PUBLIC_URL?.trim() ||
    "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function canonicalAvatarSignString(payload: AvatarSignedPayload): string {
  return [
    "v1",
    payload.workspaceId,
    payload.entityType,
    payload.entityId,
    String(payload.exp),
  ].join("\n");
}

export function signAvatarPayload(
  payload: AvatarSignedPayload,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(canonicalAvatarSignString(payload))
    .digest("hex");
}

export function verifyAvatarSignature(
  payload: AvatarSignedPayload,
  signature: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signature || signature.length !== 64) return false;
  if (!/^[0-9a-f]+$/i.test(signature)) return false;
  if (payload.exp < nowSeconds) return false;

  const expected = signAvatarPayload(payload, secret);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature.toLowerCase(), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function clampAvatarSignedTtlSeconds(ttlSeconds?: number): number {
  if (ttlSeconds == null || !Number.isFinite(ttlSeconds)) {
    return AVATAR_SIGNED_URL_DEFAULT_TTL_SECONDS;
  }
  const rounded = Math.floor(ttlSeconds);
  if (rounded < 60) return 60;
  if (rounded > AVATAR_SIGNED_URL_MAX_TTL_SECONDS) {
    return AVATAR_SIGNED_URL_MAX_TTL_SECONDS;
  }
  return rounded;
}

export function buildAvatarSignedUrl(input: {
  origin: string;
  workspaceId: string;
  entityType: AvatarSignedEntityType;
  entityId: string;
  ttlSeconds?: number;
  secret: string;
  nowSeconds?: number;
}): { url: string; expiresAt: Date; payload: AvatarSignedPayload; signature: string } {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = clampAvatarSignedTtlSeconds(input.ttlSeconds);
  const payload: AvatarSignedPayload = {
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    exp: nowSeconds + ttl,
  };
  const signature = signAvatarPayload(payload, input.secret);
  const url = new URL(
    `/api/v1/public/avatars/${encodeURIComponent(input.entityType)}/${encodeURIComponent(input.entityId)}`,
    `${input.origin.replace(/\/$/, "")}/`,
  );
  url.searchParams.set("exp", String(payload.exp));
  url.searchParams.set("sig", signature);
  url.searchParams.set("ws", input.workspaceId);
  return {
    url: url.toString(),
    expiresAt: new Date(payload.exp * 1000),
    payload,
    signature,
  };
}
