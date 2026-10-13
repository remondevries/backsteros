"use client";

import { useState } from "react";

export type EntityListAvatarProps = {
  /**
   * Resolved image URL (desktop blob URL or Next.js proxy URL).
   * When missing, renders nothing — list rows never show a default person/org icon.
   * Matches Next.js contacts/organizations side panels (`avatarStorageKey` gate).
   */
  src?: string | null;
  size?: number;
  /** Top-align for multi-line contact rows (Next.js `self-start` / `--top`). */
  align?: "center" | "top";
  /** Extra classes on the icon wrapper (e.g. org contacts row icon slot). */
  className?: string;
  /** Defaults to circle; bank-account logos use rounded-square. */
  shape?: "circle" | "rounded-square";
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
}: EntityListAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return null;
  }

  const radius =
    shape === "rounded-square" ? Math.max(3, Math.round(size * 0.22)) : 9999;

  const wrapperClass = [
    "entity-list-avatar",
    shape === "rounded-square"
      ? "entity-list-avatar--rounded-square"
      : "entity-list-avatar--circle",
    align === "top" ? "entity-list-avatar--top" : null,
    // Keep legacy class for dropdown/media selectors that target it.
    "app-side-panel-item-icon",
    align === "top" ? "app-side-panel-item-icon--top" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={wrapperClass}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: radius,
      }}
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="entity-list-avatar__img"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
