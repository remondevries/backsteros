import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "./theme";

const HEADER_ACTION_SIZE = 36;

type HeaderChrome = "glass" | "plain";

/**
 * Header action control.
 * - `glass`: custom blur pill for non-native headers (list titles).
 * - `plain`: label/glyph only — native stack already applies iOS liquid glass;
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
          styles.plainShell,
          wide ? styles.plainShellWide : null,
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
      <Text
        style={chrome === "plain" ? styles.plusGlyphPlain : styles.plusGlyph}
      >
        +
      </Text>
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
}: {
  title: string;
  /** Optional actions on the right (e.g. create +). */
  leadingActions?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: spacing.screenX,
        paddingBottom: 12,
        backgroundColor: colors.background,
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
      {leadingActions ? (
        <View style={styles.actionsRow}>{leadingActions}</View>
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

/** Native header chrome for pushed detail screens (back only, no center title). */
export function tabDetailScreenOptions() {
  return {
    title: "",
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.foreground,
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    headerBackButtonDisplayMode: "minimal" as const,
    contentStyle: { backgroundColor: colors.background },
    // iOS: edge + full-screen swipe-right pops like the back button.
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
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
    width: undefined,
    minWidth: 52,
    paddingHorizontal: 4,
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
    flex: 1,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  plusGlyph: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "400",
    lineHeight: 26,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  plusGlyphPlain: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 30,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  textGlyphPlain: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
});
