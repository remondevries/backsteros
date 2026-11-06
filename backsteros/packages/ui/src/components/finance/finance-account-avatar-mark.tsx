"use client";

import { BunqIcon } from "../icons/bunq-icon.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";

/** Stable Finance bank-account key for the bunq sandbox ledger (OS-166). */
export const BUNQ_PERSONAL_BANK_ACCOUNT_KEY = "bunq-personal";

export type FinanceAccountAvatarMarkProps = {
  src?: string | null;
  /** Single-letter fallback when no image and no brand mark. */
  initial: string;
  /** When `bunq-personal` and no uploaded logo, show the bunq brand mark. */
  accountKey?: string | null;
  size?: number;
  className?: string;
  fallbackClassName?: string;
};

/**
 * Shared bank-account avatar: uploaded logo, brand mark, or initial fallback.
 */
export function FinanceAccountAvatarMark({
  src,
  initial,
  accountKey = null,
  size = 18,
  className,
  fallbackClassName = "finance-account-dropdown-avatar-fallback",
}: FinanceAccountAvatarMarkProps) {
  if (src) {
    return (
      <EntityListAvatar
        src={src}
        size={size}
        shape="rounded-square"
        className={className}
      />
    );
  }
  if (accountKey === BUNQ_PERSONAL_BANK_ACCOUNT_KEY) {
    return (
      <span
        className={["finance-account-brand-mark", className]
          .filter(Boolean)
          .join(" ")}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <BunqIcon size={size} />
      </span>
    );
  }
  return (
    <span className={fallbackClassName} aria-hidden="true">
      {initial}
    </span>
  );
}
