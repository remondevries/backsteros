import { createHash } from "node:crypto";

export function sha256Hex(parts: Array<string | number | null | undefined>): string {
  const hash = createHash("sha256");
  hash.update(parts.map((part) => String(part ?? "")).join("|"));
  return hash.digest("hex");
}

/** Parse European decimal amounts like `11,58` or `-770,20` into integer cents. */
export function parseEuroAmountToCents(raw: string): number {
  const trimmed = raw.trim().replace(/\s/g, "").replace(/^\+/, "");
  if (!trimmed) throw new Error("Empty amount");
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Invalid amount: ${raw}`);
  return Math.round(value * 100);
}
