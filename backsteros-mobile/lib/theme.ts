import { DarkTheme, type Theme } from "@react-navigation/native";

/**
 * Mobile chrome tokens — aligned with `@backsteros/ui` product shell,
 * with a pure black canvas as requested for iOS.
 */
export const colors = {
  background: "#000000",
  surface: "#111112",
  foreground: "#ededed",
  muted: "rgba(255, 255, 255, 0.52)",
  faint: "rgba(255, 255, 255, 0.06)",
  border: "rgba(255, 255, 255, 0.1)",
  rowPressed: "rgba(255, 255, 255, 0.04)",
  danger: "#f87171",
  accent: "#ee7a47",
  inputBg: "rgba(255, 255, 255, 0.04)",
  buttonBg: "#ededed",
  buttonText: "#0a0a0a",
  githubBg: "#24292f",
} as const;

export const spacing = {
  screenX: 16,
  rowY: 14,
  chromeY: 10,
} as const;

/** React Navigation theme — pure black canvas (avoids white transition flashes). */
export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.foreground,
    background: colors.background,
    card: colors.background,
    text: colors.foreground,
    border: colors.border,
    notification: colors.accent,
  },
};
