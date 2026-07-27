import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import {
  parseCssHexColor,
  type StatusHeaderGradient,
} from "../lib/status-header-gradient";
import { colors } from "../lib/theme";

type Props = {
  title: string;
  icon: ReactNode;
  gradient: StatusHeaderGradient;
  collapsed?: boolean;
  onToggle?: () => void;
  /**
   * Optional + on the right (desktop `.status-group-add`) — e.g. add a task
   * into this status group.
   */
  onAdd?: () => void;
  addActionLabel?: string;
  /** Optional trailing control when `onAdd` is not enough. */
  trailing?: ReactNode;
};

function StatusGroupPlusIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke={colors.muted}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Desktop-parity status group header — solid base + status tint gradient,
 * status icon, and title (see `.status-group-header-row`).
 */
export function StatusGroupHeader({
  title,
  icon,
  gradient,
  collapsed = false,
  onToggle,
  onAdd,
  addActionLabel = "task",
  trailing,
}: Props) {
  const from = parseCssHexColor(gradient.from);
  const to = parseCssHexColor(gradient.to);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = `sgh-${title.replace(/[^a-zA-Z0-9]+/g, "-")}`;

  const onLayout = (width: number, height: number) => {
    if (width === size.width && height === size.height) return;
    setSize({ width, height });
  };

  const gradientLayer =
    size.width > 0 && size.height > 0 ? (
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={size.width}
        height={size.height}
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop
              offset="0"
              stopColor={from.color}
              stopOpacity={from.opacity}
            />
            <Stop offset="1" stopColor={to.color} stopOpacity={to.opacity} />
          </LinearGradient>
        </Defs>
        <Rect
          width={size.width}
          height={size.height}
          fill={`url(#${gradientId})`}
        />
      </Svg>
    ) : null;

  const mainContent = (
    <>
      <View style={styles.iconSlot}>{icon}</View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </>
  );

  const addControl = onAdd ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${addActionLabel} to ${title}`}
      hitSlop={8}
      onPress={onAdd}
      style={({ pressed }) => [
        styles.addButton,
        pressed ? styles.addButtonPressed : null,
      ]}
    >
      <StatusGroupPlusIcon />
    </Pressable>
  ) : (
    trailing
  );

  return (
    <View
      style={styles.row}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        onLayout(width, height);
      }}
    >
      {gradientLayer}
      {onToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${title}, ${collapsed ? "collapsed" : "expanded"}`}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.main,
            pressed ? styles.mainPressed : null,
          ]}
        >
          {mainContent}
        </Pressable>
      ) : (
        <View style={styles.main}>{mainContent}</View>
      )}
      {addControl}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 8,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#000000",
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 0,
  },
  mainPressed: {
    opacity: 0.9,
  },
  iconSlot: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  addButton: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
});
