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
};

/**
 * Optional list-row avatar — uploaded image only, never a fallback icon.
 */
export function EntityListAvatar({
  src,
  size = 16,
  align = "center",
  className,
}: EntityListAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return null;
  }

  const wrapperClass = [
    "app-side-panel-item-icon",
    align === "top" ? "app-side-panel-item-icon--top" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={wrapperClass} aria-hidden="true">
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{
          width: size,
          height: size,
          borderRadius: "9999px",
          objectFit: "cover",
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
