"use client";

import { useState } from "react";

import { OrganizationIcon } from "./organization-icon.js";

export type OrganizationDropdownMarkProps = {
  src?: string | null;
  size?: number;
  className?: string;
};

/**
 * Merchant / org dropdown avatar — same role as {@link FinanceAccountAvatarMark}.
 * Prefers the resolved image (stored blob or Brandfetch CDN); falls back to the
 * org glyph when missing or when the image fails to load.
 *
 * `referrerPolicy="no-referrer"` helps Brandfetch CDN hotlinks in the Tauri
 * webview (some CDN edges reject app/custom referrers).
 */
export function OrganizationDropdownMark({
  src,
  size = 18,
  className,
}: OrganizationDropdownMarkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const trimmed = src?.trim() || null;
  const failed = Boolean(trimmed) && failedSrc === trimmed;

  if (trimmed && !failed) {
    return (
      <img
        key={trimmed}
        src={trimmed}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={className}
        style={{
          borderRadius: "9999px",
          objectFit: "cover",
          width: size,
          height: size,
          display: "block",
        }}
        onError={() => setFailedSrc(trimmed)}
      />
    );
  }

  return (
    <OrganizationIcon
      size={size}
      className={className ?? "text-foreground/70"}
    />
  );
}
