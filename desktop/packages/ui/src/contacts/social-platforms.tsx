import type { ReactNode } from "react";
import { GlobeIcon, LinkIcon } from "@primer/octicons-react";

import { DiscordIcon } from "../components/icons/discord-icon.js";
import { FacebookIcon } from "../components/icons/facebook-icon.js";
import { GitHubIcon } from "../components/icons/github-icon.js";
import { InstagramIcon } from "../components/icons/instagram-icon.js";
import { LinkedInIcon } from "../components/icons/linkedin-icon.js";
import { SlackIcon } from "../components/icons/slack-icon.js";
import { XTwitterIcon } from "../components/icons/x-twitter-icon.js";

export const CONTACT_SOCIAL_PLATFORMS = [
  "LinkedIn",
  "Instagram",
  "Facebook",
  "X",
  "GitHub",
  "Discord",
  "Slack",
  "Website",
  "Other",
] as const;

export type ContactSocialPlatform = (typeof CONTACT_SOCIAL_PLATFORMS)[number];

const PLATFORM_URL_PREFIX: Record<
  Exclude<ContactSocialPlatform, "Other">,
  string
> = {
  LinkedIn: "https://www.linkedin.com/in/",
  Instagram: "https://www.instagram.com/",
  Facebook: "https://www.facebook.com/",
  X: "https://x.com/",
  GitHub: "https://github.com/",
  Discord: "https://discord.com/users/",
  Slack: "https://",
  Website: "https://",
};

/** Platforms where the value is a username shown as `@handle`. */
const HANDLE_PLATFORMS = new Set<string>([
  "LinkedIn",
  "Instagram",
  "Facebook",
  "X",
  "GitHub",
  "Discord",
]);

const ALL_PREFIXES = Object.values(PLATFORM_URL_PREFIX);

export function isContactSocialPlatform(
  value: string,
): value is ContactSocialPlatform {
  return (CONTACT_SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

export function socialPlatformUsesHandle(platform: string): boolean {
  return HANDLE_PLATFORMS.has(platform);
}

export function socialPlatformUrlPrefix(platform: string): string | null {
  if (!isContactSocialPlatform(platform) || platform === "Other") return null;
  return PLATFORM_URL_PREFIX[platform];
}

/** True when the URL is empty or still only a known platform prefix. */
export function isSocialUrlPrefixOnly(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return ALL_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed === prefix.replace(/\/$/, ""),
  );
}

/** Strip a leading `@` and path noise from a typed handle. */
export function normalizeSocialHandle(raw: string): string {
  return (
    raw
      .trim()
      .replace(/^@+/, "")
      .replace(/^\/+|\/+$/g, "")
      .split("/")[0]
      ?.trim() ?? ""
  );
}

/**
 * Username (no `@`) extracted from a stored profile URL for the platform.
 */
export function socialHandleFromUrl(platform: string, url: string): string {
  const trimmed = url.trim();
  if (!trimmed || isSocialUrlPrefixOnly(trimmed)) return "";

  const prefix = socialPlatformUrlPrefix(platform);
  if (prefix && prefix !== "https://" && trimmed.startsWith(prefix)) {
    return normalizeSocialHandle(trimmed.slice(prefix.length));
  }

  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (platform === "LinkedIn") {
      const inIndex = parts.indexOf("in");
      if (inIndex >= 0 && parts[inIndex + 1]) {
        return normalizeSocialHandle(parts[inIndex + 1]!);
      }
    }
    if (platform === "Discord") {
      const usersIndex = parts.indexOf("users");
      if (usersIndex >= 0 && parts[usersIndex + 1]) {
        return normalizeSocialHandle(parts[usersIndex + 1]!);
      }
    }
    if (socialPlatformUsesHandle(platform) && parts.length > 0) {
      return normalizeSocialHandle(parts[0]!);
    }
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parts.join("/");
    return path ? `${host}/${path}` : host;
  } catch {
    return normalizeSocialHandle(trimmed);
  }
}

/** Build the stored full URL from a typed handle / host. */
export function socialUrlFromHandle(
  platform: string,
  handleRaw: string,
): string {
  const typed = handleRaw.trim();
  if (!typed) return socialPlatformUrlPrefix(platform) ?? "";

  if (/^https?:\/\//i.test(typed)) {
    return typed;
  }

  const handle = normalizeSocialHandle(typed);
  if (!handle) return socialPlatformUrlPrefix(platform) ?? "";

  const prefix = socialPlatformUrlPrefix(platform);
  if (prefix && prefix !== "https://" && socialPlatformUsesHandle(platform)) {
    return `${prefix}${handle}`;
  }

  return `https://${handle}`;
}

/**
 * When switching platforms, replace empty / prefix-only URLs with the new
 * platform prefix so the user only types the username.
 */
export function socialUrlForPlatform(
  platform: string,
  currentUrl: string,
): string {
  const prefix = socialPlatformUrlPrefix(platform);
  if (!prefix) return isSocialUrlPrefixOnly(currentUrl) ? "" : currentUrl;
  if (isSocialUrlPrefixOnly(currentUrl)) return prefix;
  const handle = socialHandleFromUrl(
    // Prefer extracting with the destination platform rules when possible;
    // fall back via generic path parsing inside socialHandleFromUrl.
    platform,
    currentUrl,
  );
  if (handle && socialPlatformUsesHandle(platform)) {
    return socialUrlFromHandle(platform, handle);
  }
  return currentUrl;
}

/** Value shown in the chip input (`@name` for profile platforms). */
export function formatSocialHandleInput(
  platform: string,
  url: string,
): string {
  const handle = socialHandleFromUrl(platform, url);
  if (!handle) return "";
  if (socialPlatformUsesHandle(platform)) return `@${handle}`;
  return handle;
}

export function socialHandlePlaceholder(platform: string): string {
  if (socialPlatformUsesHandle(platform)) return "@username";
  if (platform === "Website" || platform === "Slack") return "example.com";
  return "username or URL";
}

export function socialPlatformIcon(
  platform: string,
  size = 14,
): ReactNode {
  switch (platform) {
    case "LinkedIn":
      return <LinkedInIcon size={size} />;
    case "Instagram":
      return <InstagramIcon size={size} />;
    case "Facebook":
      return <FacebookIcon size={size} />;
    case "X":
      return <XTwitterIcon size={size} />;
    case "GitHub":
      return <GitHubIcon size={size} />;
    case "Discord":
      return <DiscordIcon size={size} />;
    case "Slack":
      return <SlackIcon size={size} />;
    case "Website":
      return <GlobeIcon size={size} />;
    default:
      return <LinkIcon size={size} />;
  }
}
