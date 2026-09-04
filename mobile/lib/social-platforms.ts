/** Pure social platform URL/handle helpers (desktop social-platforms parity). */

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

export function socialPlatformLabel(platform: string): string {
  if (platform === "X") return "X / Twitter";
  return platform.trim() || "Other";
}

export function socialPlatformUsesHandle(platform: string): boolean {
  return HANDLE_PLATFORMS.has(platform);
}

export function socialPlatformUrlPrefix(platform: string): string | null {
  if (!isContactSocialPlatform(platform) || platform === "Other") return null;
  return PLATFORM_URL_PREFIX[platform];
}

export function isSocialUrlPrefixOnly(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return ALL_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed === prefix.replace(/\/$/, ""),
  );
}

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

export function socialUrlForPlatform(
  platform: string,
  currentUrl: string,
): string {
  const prefix = socialPlatformUrlPrefix(platform);
  if (!prefix) return isSocialUrlPrefixOnly(currentUrl) ? "" : currentUrl;
  if (isSocialUrlPrefixOnly(currentUrl)) return prefix;
  const handle = socialHandleFromUrl(platform, currentUrl);
  if (handle && socialPlatformUsesHandle(platform)) {
    return socialUrlFromHandle(platform, handle);
  }
  return currentUrl;
}

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
