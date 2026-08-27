import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "./theme";

/** Shared hit target for header icon / back controls. */
export const HEADER_ACTION_SIZE = 36;

type HeaderChrome = "glass" | "plain";

function HeaderBackChevron({
  color = colors.foreground,
  size = 22,
}: {
  color?: string;
  size?: number;
}) {
  // Optical iOS-style chevron — SVG so metrics stay centered (unlike “‹” text).
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M10.28 2.72a.75.75 0 0 1 0 1.06L5.06 9l5.22 5.22a.75.75 0 1 1-1.06 1.06l-5.75-5.75a.75.75 0 0 1 0-1.06l5.75-5.75a.75.75 0 0 1 1.06 0Z"
        fill={color}
      />
    </Svg>
  );
}

export function HeaderPlusGlyph({
  color = colors.foreground,
  size = 18,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 2.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 2.5Z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * Header action control.
 * - `glass`: custom blur pill for non-native headers (list titles).
 * - `plain`: icon-only — native stack already applies iOS liquid glass;
 *   wrapping again causes the double-border look.
 */
function HeaderActionButton({
  onPress,
  disabled = false,
  accessibilityLabel,
  children,
  wide = false,
  chrome = "glass",
}: {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  children: ReactNode;
  /** Pill width for text labels like Edit / Save. */
  wide?: boolean;
  chrome?: HeaderChrome;
}) {
  if (chrome === "plain") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          wide ? styles.plainShellWide : styles.plainShell,
          disabled ? { opacity: 0.35 } : null,
          pressed && !disabled ? { opacity: 0.55 } : null,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.glassShell,
        wide ? styles.glassShellWide : null,
        disabled ? { opacity: 0.4 } : null,
        pressed && !disabled ? styles.glassPressed : null,
      ]}
    >
      <View style={styles.glassBackdrop} pointerEvents="none">
        <BlurView
          intensity={55}
          tint="systemChromeMaterialDark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassFill} />
        <View
          style={[styles.glassBorder, wide ? styles.glassBorderWide : null]}
        />
      </View>
      <View style={styles.glassContent}>{children}</View>
    </Pressable>
  );
}

/**
 * Unified header back — fixed 36×36 hit target, SVG chevron centered.
 * Replaces ad-hoc “‹” Text buttons that drifted optically across screens.
 */
export function TabStackHeaderBackButton({
  onPress,
  tintColor,
  label,
  accessibilityLabel = "Back",
}: {
  onPress: () => void;
  tintColor?: string;
  /** Optional label after the chevron (e.g. iPad task chrome). */
  label?: string;
  accessibilityLabel?: string;
}) {
  const color = tintColor ?? colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        label ? styles.backShellLabeled : styles.plainShell,
        pressed ? { opacity: 0.55 } : null,
      ]}
    >
      <HeaderBackChevron color={color} size={22} />
      {label ? (
        <Text style={[styles.backLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Header “+” — glass by default (custom list headers); use `chrome="plain"` in native stack headers. */
export function TabStackHeaderPlusButton({
  onPress,
  disabled = false,
  accessibilityLabel = "Add",
  chrome = "glass",
}: {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  chrome?: HeaderChrome;
}) {
  return (
    <HeaderActionButton
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      chrome={chrome}
    >
      <HeaderPlusGlyph
        color={colors.foreground}
        size={chrome === "plain" ? 20 : 18}
      />
    </HeaderActionButton>
  );
}

/** Header icon action — same glass/plain chrome as the plus control. */
export function TabStackHeaderIconButton({
  onPress,
  disabled = false,
  accessibilityLabel,
  chrome = "glass",
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  chrome?: HeaderChrome;
  children: ReactNode;
}) {
  return (
    <HeaderActionButton
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      chrome={chrome}
    >
      {children}
    </HeaderActionButton>
  );
}

/**
 * Edit / Save for native stack headers — plain so iOS liquid glass wraps once.
 */
export function TabStackHeaderTextButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <HeaderActionButton
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      wide
      chrome="plain"
    >
      {loading ? (
        <ActivityIndicator color={colors.foreground} size="small" />
      ) : (
        <Text style={styles.textGlyphPlain}>{label}</Text>
      )}
    </HeaderActionButton>
  );
}

export function TabStackHeader({
  title,
  leadingActions,
  trailingActions,
  includeSafeArea = true,
  backgroundColor = colors.background,
}: {
  title: string;
  /** Optional actions on the right (e.g. create +). */
  leadingActions?: ReactNode;
  /** Optional trailing controls (e.g. iPad side-panel collapse). */
  trailingActions?: ReactNode;
  /** When false, skip top safe-area inset (panel already inset). */
  includeSafeArea?: boolean;
  /** Header band fill — surface when nested in a carded side panel. */
  backgroundColor?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: includeSafeArea ? insets.top + 8 : 10,
        paddingHorizontal: spacing.screenX,
        paddingBottom: 10,
        backgroundColor,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          color: colors.foreground,
          fontWeight: "600",
          fontSize: 22,
        }}
      >
        {title}
      </Text>
      {leadingActions || trailingActions ? (
        <View style={styles.actionsRow}>
          {leadingActions}
          {trailingActions}
        </View>
      ) : null}
    </View>
  );
}

/** Shared stack chrome for tab root list screens. */
export function tabRootScreenOptions(
  title: string,
  options?: { leadingActions?: ReactNode },
) {
  return {
    title,
    header: () => (
      <TabStackHeader
        title={title}
        leadingActions={options?.leadingActions}
      />
    ),
    contentStyle: { backgroundColor: colors.background },
  };
}

/** Shared native-stack gesture policy (iOS). */
export const iosStackGestureOptions = {
  gestureEnabled: true,
  /**
   * Edge-only interactive pop — not full-screen. Full-screen back swipe
   * conflicts with ScrollView / FlatList: slight horizontal drift while
   * scrolling vertically triggers the pop animation instead of scroll
   * (react-native-screens #1510, #3302). Standard iOS apps use edge swipe.
   */
  fullScreenGestureEnabled: false,
} as const;

/** Native header chrome for pushed detail screens (back only, no sticky title). */
export function tabDetailScreenOptions(options?: {
  /**
   * iPad floating content card: paint `surface` (not pure black) so native
   * stack layers match `PadContentFrame` even when children are opaque.
   */
  embedded?: boolean;
}) {
  // Prefer `surface` over `transparent` — native-stack still seeds
  // `theme.colors.background` (#000) under contentStyle; transparent can lose
  // to sibling/header layers on Inbox/Journal fade stacks.
  const bg = options?.embedded ? colors.surface : colors.background;
  return {
    title: "",
    headerTitle: () => null,
    headerTitleAlign: "left" as const,
    headerStyle: { backgroundColor: bg },
    headerTintColor: colors.foreground,
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    headerBackButtonDisplayMode: "minimal" as const,
    contentStyle: { backgroundColor: bg },
    ...iosStackGestureOptions,
  };
}

/** Default options for tabs that only have a root screen (search). */
export function tabStackScreenOptions(title: string) {
  return tabRootScreenOptions(title);
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  plainShell: {
    width: HEADER_ACTION_SIZE,
    height: HEADER_ACTION_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  plainShellWide: {
    height: HEADER_ACTION_SIZE,
    minWidth: 52,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  backShellLabeled: {
    height: HEADER_ACTION_SIZE,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingRight: 8,
  },
  backLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  glassShell: {
    width: HEADER_ACTION_SIZE,
    height: HEADER_ACTION_SIZE,
    borderRadius: HEADER_ACTION_SIZE / 2,
    overflow: "hidden",
  },
  glassShellWide: {
    width: undefined,
    minWidth: HEADER_ACTION_SIZE,
    paddingHorizontal: 14,
  },
  glassPressed: {
    opacity: 0.72,
  },
  glassBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  glassFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 22, 0.45)",
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: HEADER_ACTION_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  glassBorderWide: {
    borderRadius: HEADER_ACTION_SIZE / 2,
  },
  glassContent: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textGlyphPlain: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
});
