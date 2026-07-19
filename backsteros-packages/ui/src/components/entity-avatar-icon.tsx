"use client";

import { useState, type CSSProperties } from "react";

import { ContactPersonIcon } from "./contact-person-icon.js";
import { OrganizationIcon } from "./organization-icon.js";

export type EntityAvatarIconProps = {
  src?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
  kind?: "contact" | "organization";
};

/**
 * Round avatar with person/org fallback — for assignees, dropdowns, property rows.
 * List rows use {@link EntityListAvatar} instead (uploaded image only, no fallback).
 */
export function EntityAvatarIcon({
  src,
  size = 14,
  className,
  style,
  kind = "contact",
}: EntityAvatarIconProps) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{
          borderRadius: "9999px",
          objectFit: "cover",
          width: size,
          height: size,
          ...style,
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  if (kind === "organization") {
    return (
      <OrganizationIcon size={size} className={className ?? "text-foreground/70"} />
    );
  }

  return (
    <ContactPersonIcon size={size} className={className ?? "text-foreground/70"} />
  );
}
