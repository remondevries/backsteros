"use client";

import { EntityListAvatar } from "../entity/entity-list-avatar.js";

export type FinanceAccountAvatarMarkProps = {
  src?: string | null;
  /** Single-letter fallback when no image. */
  initial: string;
  size?: number;
  className?: string;
  fallbackClassName?: string;
};

/**
 * Shared bank-account avatar: uploaded logo or initial fallback.
 */
export function FinanceAccountAvatarMark({
  src,
  initial,
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
  return (
    <span className={fallbackClassName} aria-hidden="true">
      {initial}
    </span>
  );
}
