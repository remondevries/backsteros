import type { CSSProperties } from "react";

import { normalizeProviderAccentColor } from "./providerInstances";

/**
 * Composer accent swatches — BacksterOS desktop chromatics only (no slate/gray).
 * Starts from entity/CRM icon presets, then fills to 10 from route accent colors
 * in `desktop/packages/ui` navigation copy.
 */
export const PROVIDER_ACCENT_SWATCHES = [
  "#38BDF8", // sky (entity)
  "#4ADE80", // green (entity)
  "#FACC15", // yellow (entity)
  "#FB923C", // orange (entity)
  "#FDBA74", // peach (entity)
  "#F87171", // red (entity)
  "#b68cff", // violet (inbox)
  "#8b7cf6", // purple (network)
  "#5bbad5", // teal (contacts)
  "#ee7a47", // coral (projects)
] as const;

export type ProviderAccentSwatch = (typeof PROVIDER_ACCENT_SWATCHES)[number];

export const PROVIDER_ACCENT_SWATCH_LABELS: Record<ProviderAccentSwatch, string> = {
  "#38BDF8": "Sky",
  "#4ADE80": "Green",
  "#FACC15": "Yellow",
  "#FB923C": "Orange",
  "#FDBA74": "Peach",
  "#F87171": "Red",
  "#b68cff": "Violet",
  "#8b7cf6": "Purple",
  "#5bbad5": "Teal",
  "#ee7a47": "Coral",
};

const FALLBACK_ACCENT_COLOR: ProviderAccentSwatch = PROVIDER_ACCENT_SWATCHES[0];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable palette index for a scope key — same chat/agent scope always maps to the same swatch. */
export function providerAccentSwatchIndex(scopeKey: string): number {
  return hashString(scopeKey) % PROVIDER_ACCENT_SWATCHES.length;
}

export function providerAccentSwatchForInstance(scopeKey: string): ProviderAccentSwatch {
  return PROVIDER_ACCENT_SWATCHES[providerAccentSwatchIndex(scopeKey)] ?? FALLBACK_ACCENT_COLOR;
}

/**
 * Build the stable key used to pick a composer accent.
 * Prefer the thread so switching chats changes color even when the provider is
 * the same; include the instance so switching agents in-thread also changes it.
 */
export function composerAccentScopeKey(input: {
  threadId?: string | null;
  draftKey?: string | null;
  instanceId?: string | null;
}): string | undefined {
  const threadId = input.threadId?.trim() || undefined;
  const draftKey = input.draftKey?.trim() || undefined;
  const instanceId = input.instanceId?.trim() || undefined;
  const chatKey = threadId ?? draftKey;
  if (chatKey && instanceId) return `${chatKey}:${instanceId}`;
  return chatKey ?? instanceId;
}

/**
 * Accent for composer chrome (outline + send).
 * Order: chat override → provider accent → stable hash of chat+agent scope.
 */
export function resolveProviderAccentColor(
  instanceId: string | undefined,
  accentColor: string | undefined,
): string {
  return resolveComposerAccentColor({ instanceId, accentColor });
}

export function resolveComposerAccentColor(input: {
  threadId?: string | null;
  draftKey?: string | null;
  instanceId?: string | null;
  accentColor?: string | null;
  /** Persisted per-chat override from the context-menu color picker. */
  overrideColor?: string | null;
}): string {
  const override = normalizeProviderAccentColor(input.overrideColor ?? undefined);
  if (override) return override;
  const configured = normalizeProviderAccentColor(input.accentColor ?? undefined);
  if (configured) return configured;
  const scopeKey = composerAccentScopeKey(input);
  if (!scopeKey) return FALLBACK_ACCENT_COLOR;
  return providerAccentSwatchForInstance(scopeKey);
}

function accentForeground(hex: string): string {
  const normalized = normalizeProviderAccentColor(hex) ?? FALLBACK_ACCENT_COLOR;
  const numeric = Number.parseInt(normalized.slice(1), 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  // Relative luminance (sRGB) — light accents need dark glyphs.
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? "#0a0a0a" : "#ffffff";
}

export function providerAccentForeground(hex: string): string {
  return accentForeground(hex);
}

/** Inline styles for solid send/action chrome that must not fall back to theme primary. */
export function composerAgentAccentButtonStyle(accentColor: string): CSSProperties {
  const accent = normalizeProviderAccentColor(accentColor) ?? FALLBACK_ACCENT_COLOR;
  return {
    backgroundColor: accent,
    borderColor: accent,
    color: accentForeground(accent),
  };
}

/** CSS variables scoped onto the composer so outline + send follow the accent. */
export function composerAgentAccentStyle(accentColor: string): CSSProperties {
  const accent = normalizeProviderAccentColor(accentColor) ?? FALLBACK_ACCENT_COLOR;
  const foreground = accentForeground(accent);
  const hover = `color-mix(in srgb, ${accent} 90%, var(--background))`;
  // Set both the semantic tokens and the Tailwind `--color-*` mirrors. The
  // theme defines `--color-message-action: var(--message-action)` on `:root`,
  // which resolves against root — so overriding `--message-action` alone on
  // the composer does not recolor `bg-message-action` descendants.
  return {
    "--composer-agent-accent": accent,
    "--message-action": accent,
    "--message-action-hover": hover,
    "--message-action-foreground": foreground,
    "--color-message-action": accent,
    "--color-message-action-hover": hover,
    "--color-message-action-foreground": foreground,
  } as CSSProperties;
}
