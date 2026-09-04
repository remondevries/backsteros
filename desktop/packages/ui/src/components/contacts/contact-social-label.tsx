"use client";

import {
  formatSocialHandleInput,
  socialPlatformIcon,
} from "../../contacts/social-platforms.js";

export type ContactSocialLabelProps = {
  platform: string;
  url: string;
  className?: string;
  /** Denser chip for list rows (matches CrmGroupLabel compact). */
  compact?: boolean;
};

/**
 * Pill label with platform icon + handle — same chrome as CrmGroupLabel,
 * but the color dot is replaced by the social platform icon.
 */
export function ContactSocialLabel({
  platform,
  url,
  className = "",
  compact = false,
}: ContactSocialLabelProps) {
  const handle = formatSocialHandleInput(platform, url);
  const label = handle || platform;

  return (
    <span
      className={[
        "crm-group-label",
        "contact-social-label",
        compact ? "crm-group-label--compact" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={`${platform}${handle ? ` ${handle}` : ""}`}
    >
      <span className="contact-social-label__icon" aria-hidden="true">
        {socialPlatformIcon(platform, compact ? 11 : 14)}
      </span>
      <span className="crm-group-label__name">{label}</span>
    </span>
  );
}
