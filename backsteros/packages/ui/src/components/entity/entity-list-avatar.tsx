"use client";

import { useState } from "react";

export type EntityListAvatarProps = {
  /**
   * Resolved image URL (desktop blob URL or Next.js proxy URL).
   * When missing (and no linkDot), renders nothing — list rows never show a
   * default person/org icon. Matches Next.js contacts/organizations side
   * panels (`avatarStorageKey` gate).
   */
  src?: string | null;
  size?: number;
  /** Top-align for multi-line contact rows (Next.js `self-start` / `--top`). */
  align?: "center" | "top";
  /** Extra classes on the outer wrapper (or icon when no linkDot). */
  className?: string;
  /** Defaults to circle; bank-account logos use rounded-square. */
  shape?: "circle" | "rounded-square";
  /**
   * Small blue dot at the top-right (e.g. Moneybird-linked organization).
   * When set without `src`, still renders a sized slot so the indicator has
   * an anchor corner.
   */
  linkDot?: boolean;
  /** Accessible label for the linkDot (default: Linked to Moneybird). */
  linkDotLabel?: string;
};

/**
 * Optional list-row avatar — uploaded image only, never a fallback icon.
 * Always renders as a square (equal width/height), clipped to circle or
 * rounded-square so non-square source images cannot spill out.
 */
export function EntityListAvatar({
  src,
  size = 16,
  align = "center",
  className,
  shape = "circle",
  linkDot = false,
  linkDotLabel = "Linked to Moneybird",
}: EntityListAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (!showImage && !linkDot) {
    return null;
  }

  const radius =
    shape === "rounded-square" ? Math.max(3, Math.round(size * 0.22)) : 9999;

  const avatarClass = [
    "entity-list-avatar",
    shape === "rounded-square"
      ? "entity-list-avatar--rounded-square"
      : "entity-list-avatar--circle",
    align === "top" ? "entity-list-avatar--top" : null,
    // Keep legacy class for dropdown/media selectors that target it.
    "app-side-panel-item-icon",
    align === "top" ? "app-side-panel-item-icon--top" : null,
    !showImage ? "entity-list-avatar--empty" : null,
    linkDot ? null : className,
  ]
    .filter(Boolean)
    .join(" ");

  const avatar = (
    <span
      className={avatarClass}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: radius,
      }}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          className="entity-list-avatar__img"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );

  if (!linkDot) {
    return avatar;
  }

  return (
    <span
      className={["entity-list-avatar-wrap", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {avatar}
      <span
        className="entity-list-avatar__link-dot"
        title={linkDotLabel}
        aria-label={linkDotLabel}
        role="img"
      />
    </span>
  );
}
